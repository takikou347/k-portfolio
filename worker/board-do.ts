import { DurableObject } from 'cloudflare:workers';
import { CLOSE_CODE_FULL, MAX_CONNECTIONS, MAX_SPECTATORS, MAX_STROKES } from '../shared/limits';
import { applyOp, type BoardState } from '../shared/ops';
import {
  clientMessageSchema,
  joinSchema,
  type Op,
  type ServerMessage,
  type Sticky,
  type Stroke,
  type User,
} from '../shared/schema';
import { RateLimiter } from './rate-limit';

/** 接続ごとのセッション情報。serializeAttachment に保存しハイバネーションを越える */
type Session = User & {
  /** 満席時に読み取り専用で入室したか */
  spectator: boolean;
  /** leave を二重にブロードキャストしないためのフラグ */
  left?: boolean;
};

/**
 * 1 ボード = 1 Durable Object。
 * WebSocket Hibernation API のみを使い、セッション情報は serializeAttachment、
 * 盤面は SQLite ストレージに置く (メモリ状態はハイバネーションで消えるため)。
 */
export class BoardDO extends DurableObject<Env> {
  #rates = new RateLimiter();

  /** 盤面キャッシュ。正は SQLite で、ハイバネーション復帰後は遅延ロードし直す */
  #board: BoardState | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.blockConcurrencyWhile(async () => {
      this.initTables();
    });
  }

  private initTables(): void {
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS strokes (
        seq  INTEGER PRIMARY KEY AUTOINCREMENT,
        id   TEXT UNIQUE NOT NULL,
        data TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS stickies (
        id   TEXT PRIMARY KEY,
        data TEXT NOT NULL
      );
    `);
  }

  // ---- 接続 ----

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }
    const url = new URL(request.url);
    const join = joinSchema.safeParse({
      name: url.searchParams.get('name'),
      color: url.searchParams.get('color'),
    });
    if (!join.success) {
      return new Response('invalid join', { status: 400 });
    }

    const members = this.members();
    const spectator = members.length >= MAX_CONNECTIONS;
    // スペクテータ (読み取り専用の見学) にも上限を設け、超えたら接続を拒否する。
    // close code で満席を伝え、クライアントの再接続ループを止める
    if (spectator && this.spectatorCount() >= MAX_SPECTATORS) {
      const rejected = new WebSocketPair();
      this.ctx.acceptWebSocket(rejected[1]);
      rejected[1].close(CLOSE_CODE_FULL, 'board full');
      return new Response(null, { status: 101, webSocket: rejected[0] });
    }
    const session: Session = { id: crypto.randomUUID(), ...join.data, spectator };

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(session);

    const users = spectator
      ? members
      : [...members, { id: session.id, name: session.name, color: session.color }];
    this.send(server, {
      type: 'snapshot',
      self: session,
      users,
      full: spectator,
      state: this.board(),
    });
    if (!spectator) {
      this.broadcast({ type: 'presence', event: 'join', user: session, users }, server);
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  // ---- 受信 ----

  override async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string): Promise<void> {
    if (typeof message !== 'string') return;
    const session = this.session(ws);
    if (!session || session.spectator) return;

    let json: unknown;
    try {
      json = JSON.parse(message);
    } catch {
      return; // 不正な JSON は黙って破棄
    }
    const parsed = clientMessageSchema.safeParse(json);
    if (!parsed.success) return; // スキーマ検証に失敗したメッセージは黙って破棄
    const msg = parsed.data;

    switch (msg.type) {
      case 'cursor': {
        if (!this.#rates.allow(ws, 'cursor', Date.now())) return;
        // ephemeral: 永続化せず送信元以外へブロードキャストするだけ
        this.broadcast({ type: 'cursor', userId: session.id, x: msg.x, y: msg.y }, ws);
        break;
      }
      case 'stroking': {
        if (!this.#rates.allow(ws, 'stroking', Date.now())) return;
        // ephemeral: 描画中プレビュー。永続化しない
        this.broadcast({ ...msg, userId: session.id }, ws);
        break;
      }
      case 'reaction': {
        if (!this.#rates.allow(ws, 'reaction', Date.now())) return;
        // ephemeral: ブロードキャストのみで永続化しない
        this.broadcast({ ...msg, userId: session.id }, ws);
        break;
      }
      case 'op': {
        if (!this.#rates.allow(ws, 'op', Date.now())) return;
        if (this.applyAndPersist(msg.op)) {
          this.broadcast({ type: 'op', op: msg.op }, ws);
        }
        break;
      }
    }
  }

  // ---- 盤面 ----

  /** 盤面キャッシュを返す。未ロードなら SQLite から復元する */
  board(): BoardState {
    if (this.#board) return this.#board;
    const strokes: Stroke[] = [];
    for (const row of this.ctx.storage.sql.exec('SELECT data FROM strokes ORDER BY seq ASC')) {
      strokes.push(JSON.parse(row.data as string) as Stroke);
    }
    const stickies: Sticky[] = [];
    for (const row of this.ctx.storage.sql.exec('SELECT data FROM stickies ORDER BY id ASC')) {
      stickies.push(JSON.parse(row.data as string) as Sticky);
    }
    this.#board = { strokes, stickies };
    return this.#board;
  }

  /**
   * op を共有 reducer で適用し、変更があれば SQLite に反映する。
   * 変更がなかった (無効な op) 場合は false を返し、ブロードキャストもしない。
   */
  applyAndPersist(op: Op): boolean {
    const before = this.board();
    const after = applyOp(before, op);
    if (after === before) return false;
    this.#board = after;

    const sql = this.ctx.storage.sql;
    switch (op.type) {
      case 'addStroke': {
        sql.exec(
          'INSERT OR IGNORE INTO strokes (id, data) VALUES (?, ?)',
          op.stroke.id,
          JSON.stringify(op.stroke),
        );
        // 上限を超えたら古い順に間引く (reducer と同じ規則を SQL 側にも適用)
        const count = Number(sql.exec('SELECT COUNT(*) AS c FROM strokes').one().c);
        if (count > MAX_STROKES) {
          sql.exec(
            'DELETE FROM strokes WHERE seq IN (SELECT seq FROM strokes ORDER BY seq ASC LIMIT ?)',
            count - MAX_STROKES,
          );
        }
        break;
      }
      case 'eraseStroke': {
        sql.exec('DELETE FROM strokes WHERE id = ?', op.strokeId);
        break;
      }
      case 'addSticky': {
        sql.exec(
          'INSERT OR IGNORE INTO stickies (id, data) VALUES (?, ?)',
          op.sticky.id,
          JSON.stringify(op.sticky),
        );
        break;
      }
      case 'moveSticky':
      case 'editSticky':
      case 'recolorSticky': {
        // reducer 適用後のキャッシュが正。該当行を丸ごと書き直す
        const updated = after.stickies.find((s) => s.id === op.id);
        if (updated) {
          sql.exec('UPDATE stickies SET data = ? WHERE id = ?', JSON.stringify(updated), op.id);
        }
        break;
      }
      case 'deleteSticky': {
        sql.exec('DELETE FROM stickies WHERE id = ?', op.id);
        break;
      }
    }
    return true;
  }

  // ---- 切断 ----

  override async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    this.leave(ws);
    try {
      ws.close(code < 1000 || code > 4999 ? 1000 : code, reason.slice(0, 123));
    } catch {
      // すでに閉じている場合は無視
    }
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    this.leave(ws);
  }

  private leave(ws: WebSocket): void {
    const session = this.session(ws);
    if (!session || session.left) return;
    ws.serializeAttachment({ ...session, left: true });
    if (!session.spectator) {
      const users = this.members().filter((u) => u.id !== session.id);
      this.broadcast({ type: 'presence', event: 'leave', user: session, users }, ws);
    }
  }

  // ---- ヘルパー ----

  private session(ws: WebSocket): Session | null {
    // インスタンス変数に依存せず、毎回 attachment から復元する
    return (ws.deserializeAttachment() as Session | null) ?? null;
  }

  /** 接続中の参加者 (スペクテータ・退室済みを除く) */
  private members(): User[] {
    const users: User[] = [];
    for (const ws of this.ctx.getWebSockets()) {
      const s = this.session(ws);
      if (s && !s.spectator && !s.left) {
        users.push({ id: s.id, name: s.name, color: s.color });
      }
    }
    return users;
  }

  /** 接続中のスペクテータ数 */
  private spectatorCount(): number {
    let count = 0;
    for (const ws of this.ctx.getWebSockets()) {
      const s = this.session(ws);
      if (s?.spectator && !s.left) count += 1;
    }
    return count;
  }

  private send(ws: WebSocket, msg: ServerMessage): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // 送信できない接続は無視 (close 処理に任せる)
    }
  }

  /** 送信元を除く全接続 (スペクテータ含む) へ配信する */
  private broadcast(msg: ServerMessage, except?: WebSocket): void {
    const data = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except) continue;
      try {
        ws.send(data);
      } catch {
        // 送信できない接続は無視
      }
    }
  }
}
