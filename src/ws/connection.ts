import { CLOSE_CODE_FULL, CURSOR_THROTTLE_MS } from '../../shared/limits';
import {
  serverMessageSchema,
  type ClientMessage,
  type Join,
  type ServerMessage,
} from '../../shared/schema';

export type ConnectionStatus = 'connecting' | 'open' | 'reconnecting';

type Handlers = {
  onMessage: (msg: ServerMessage) => void;
  onStatus: (status: ConnectionStatus) => void;
  /** スペクテータ上限超過で接続拒否されたとき (再接続は行わない) */
  onFull: () => void;
};

/**
 * ボードへの WebSocket 接続。切断時は指数バックオフで自動再接続する
 * (再接続時はサーバーが snapshot を送り直すので、状態はそれで取り直される)。
 */
export class BoardConnection {
  #ws: WebSocket | null = null;
  #closed = false;
  #attempts = 0;
  #reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  #cursorTimer: ReturnType<typeof setTimeout> | null = null;
  #pendingCursor: { x: number; y: number } | null = null;
  #lastCursorAt = 0;

  constructor(
    private readonly boardId: string,
    private readonly join: Join,
    private readonly handlers: Handlers,
  ) {}

  connect(): void {
    if (this.#closed) return;
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const params = new URLSearchParams({ name: this.join.name, color: this.join.color });
    const ws = new WebSocket(`${proto}://${window.location.host}/ws/${this.boardId}?${params}`);
    this.#ws = ws;
    this.handlers.onStatus(this.#attempts === 0 ? 'connecting' : 'reconnecting');

    ws.addEventListener('open', () => {
      if (this.#ws !== ws) return;
      this.#attempts = 0;
      this.handlers.onStatus('open');
    });
    ws.addEventListener('message', (e) => {
      if (this.#ws !== ws || typeof e.data !== 'string') return;
      let json: unknown;
      try {
        json = JSON.parse(e.data);
      } catch {
        return;
      }
      const parsed = serverMessageSchema.safeParse(json);
      if (parsed.success) this.handlers.onMessage(parsed.data);
    });
    ws.addEventListener('close', (e) => {
      if (this.#ws !== ws) return;
      if (e.code === CLOSE_CODE_FULL) {
        // 満席で接続拒否。再接続してもすぐ拒否されるだけなのでループを止める
        this.#closed = true;
        this.handlers.onFull();
        return;
      }
      this.#scheduleReconnect();
    });
  }

  #scheduleReconnect(): void {
    if (this.#closed) return;
    this.handlers.onStatus('reconnecting');
    const base = Math.min(500 * 2 ** this.#attempts, 8000);
    const delay = base * (0.7 + Math.random() * 0.6);
    this.#attempts += 1;
    this.#reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  send(msg: ClientMessage): void {
    if (this.#ws?.readyState === WebSocket.OPEN) {
      this.#ws.send(JSON.stringify(msg));
    }
  }

  /** カーソル座標 (ボード座標) を 80ms スロットルで送る。最後の座標は必ず届く */
  sendCursor(x: number, y: number): void {
    this.#pendingCursor = { x, y };
    if (this.#cursorTimer !== null) return;
    const elapsed = Date.now() - this.#lastCursorAt;
    if (elapsed >= CURSOR_THROTTLE_MS) {
      this.#flushCursor();
    } else {
      this.#cursorTimer = setTimeout(() => {
        this.#cursorTimer = null;
        this.#flushCursor();
      }, CURSOR_THROTTLE_MS - elapsed);
    }
  }

  #flushCursor(): void {
    if (!this.#pendingCursor) return;
    this.#lastCursorAt = Date.now();
    this.send({ type: 'cursor', ...this.#pendingCursor });
    this.#pendingCursor = null;
  }

  close(): void {
    this.#closed = true;
    if (this.#reconnectTimer !== null) clearTimeout(this.#reconnectTimer);
    if (this.#cursorTimer !== null) clearTimeout(this.#cursorTimer);
    this.#ws?.close(1000);
    this.#ws = null;
  }
}
