import { env, runInDurableObject, SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { CLOSE_CODE_FULL, MAX_CONNECTIONS, MAX_SPECTATORS, MAX_STROKES } from '../../shared/limits';
import type { ServerMessage, Stroke } from '../../shared/schema';
import type { BoardDO } from '../../worker/board-do';

type Inbox = {
  ws: WebSocket;
  next: () => Promise<ServerMessage>;
};

/** WS を開き、受信メッセージをキューイングして順に await できるようにする */
async function connect(board: string, name: string, color = 'red'): Promise<Inbox> {
  const res = await SELF.fetch(
    `https://example.com/ws/${board}?name=${encodeURIComponent(name)}&color=${color}`,
    { headers: { Upgrade: 'websocket' } },
  );
  expect(res.status).toBe(101);
  const ws = res.webSocket;
  if (!ws) throw new Error('no webSocket on response');
  const queue: ServerMessage[] = [];
  const waiters: ((msg: ServerMessage) => void)[] = [];
  ws.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data as string) as ServerMessage;
    const waiter = waiters.shift();
    if (waiter) waiter(msg);
    else queue.push(msg);
  });
  ws.accept();
  return {
    ws,
    next: () => {
      const head = queue.shift();
      if (head) return Promise.resolve(head);
      return new Promise((resolve) => waiters.push(resolve));
    },
  };
}

describe('Worker ルーティング', () => {
  it('/ws/:boardId への非 WebSocket リクエストは 426 を返す', async () => {
    const res = await SELF.fetch('https://example.com/ws/main');
    expect(res.status).toBe(426);
  });

  it('不正な入室情報 (名前 1 文字) は 400 で拒否する', async () => {
    const res = await SELF.fetch('https://example.com/ws/main?name=%E3%81%82&color=red', {
      headers: { Upgrade: 'websocket' },
    });
    expect(res.status).toBe(400);
  });
});

describe('BoardDO: presence とライブカーソル', () => {
  it('接続 → snapshot 受信 → 2人目の join が届く → cursor がブロードキャストされる', async () => {
    const a = await connect('presence-board', 'はなこ');

    const snapA = await a.next();
    expect(snapA.type).toBe('snapshot');
    if (snapA.type !== 'snapshot') return;
    expect(snapA.self.name).toBe('はなこ');
    expect(snapA.full).toBe(false);
    expect(snapA.users).toHaveLength(1);

    const b = await connect('presence-board', 'たろう', 'blue');
    const snapB = await b.next();
    expect(snapB.type).toBe('snapshot');
    if (snapB.type !== 'snapshot') return;
    expect(snapB.users).toHaveLength(2);

    // A には join の presence が届く
    const joinMsg = await a.next();
    expect(joinMsg).toMatchObject({
      type: 'presence',
      event: 'join',
      user: { name: 'たろう', color: 'blue' },
    });

    // B が cursor を送ると A に届く (送信元 B には返らない)
    b.ws.send(JSON.stringify({ type: 'cursor', x: 12, y: 34 }));
    const cursorMsg = await a.next();
    expect(cursorMsg).toMatchObject({ type: 'cursor', userId: snapB.self.id, x: 12, y: 34 });

    // B が切断すると A に leave が届く
    b.ws.close(1000);
    const leaveMsg = await a.next();
    expect(leaveMsg).toMatchObject({ type: 'presence', event: 'leave' });
    if (leaveMsg.type === 'presence') {
      expect(leaveMsg.users).toHaveLength(1);
    }
  });

  it('addStroke op が接続 → 検証 → 適用 → 永続化 → ブロードキャストされる', async () => {
    const stroke: Stroke = {
      id: 'stroke-1',
      color: 'yellow',
      points: [
        { x: 1, y: 2 },
        { x: 3, y: 4 },
      ],
    };

    const a = await connect('stroke-board', 'はなこ');
    await a.next(); // snapshot
    const b = await connect('stroke-board', 'たろう', 'blue');
    await b.next(); // snapshot
    await a.next(); // join presence

    // B が描いたストロークが A にブロードキャストされる
    b.ws.send(JSON.stringify({ type: 'op', op: { type: 'addStroke', stroke } }));
    const opMsg = await a.next();
    expect(opMsg).toEqual({ type: 'op', op: { type: 'addStroke', stroke } });

    // ストレージに反映され、後から入る C の snapshot に含まれる (永続化)
    const c = await connect('stroke-board', 'じろう', 'yellow');
    const snapC = await c.next();
    expect(snapC.type).toBe('snapshot');
    if (snapC.type !== 'snapshot') return;
    expect(snapC.state.strokes).toEqual([stroke]);
    await b.next(); // C の join presence を消費

    // 黒板消し: eraseStroke も同期・永続化される
    a.ws.send(JSON.stringify({ type: 'op', op: { type: 'eraseStroke', strokeId: 'stroke-1' } }));
    const eraseMsg = await b.next();
    expect(eraseMsg).toMatchObject({ type: 'op', op: { type: 'eraseStroke' } });
    const d = await connect('stroke-board', 'よんこ', 'pink');
    const snapD = await d.next();
    if (snapD.type !== 'snapshot') return;
    expect(snapD.state.strokes).toEqual([]);
  });

  it('eraseArea op で触れた部分だけが消え、分割された断片が永続化される', async () => {
    const line: Stroke = {
      id: 'line-1',
      color: 'white',
      points: Array.from({ length: 11 }, (_, i) => ({ x: i * 10, y: 0 })),
    };

    const a = await connect('erase-area-board', 'はなこ');
    await a.next(); // snapshot
    const b = await connect('erase-area-board', 'たろう', 'blue');
    await b.next(); // snapshot
    await a.next(); // join presence

    a.ws.send(JSON.stringify({ type: 'op', op: { type: 'addStroke', stroke: line } }));
    await b.next();

    // B が中央をなぞると、op がそのまま A にブロードキャストされる
    const erase = { type: 'eraseArea', points: [{ x: 50, y: 0 }], r: 5 };
    b.ws.send(JSON.stringify({ type: 'op', op: erase }));
    expect(await a.next()).toEqual({ type: 'op', op: erase });

    // 後から入る C の snapshot は分割後の 2 断片 (中央の点は消えている) = 永続化されている
    const c = await connect('erase-area-board', 'じろう', 'yellow');
    const snapC = await c.next();
    expect(snapC.type).toBe('snapshot');
    if (snapC.type !== 'snapshot') return;
    expect(snapC.state.strokes).toHaveLength(2);
    const [front, back] = snapC.state.strokes;
    expect(front.points).toEqual(line.points.slice(0, 5));
    expect(back.points).toEqual(line.points.slice(6));
    expect(front.id).not.toBe('line-1');
    await a.next(); // C の join presence を消費

    // どのストロークにも触れない eraseArea は無効 op としてブロードキャストされない
    b.ws.send(
      JSON.stringify({ type: 'op', op: { type: 'eraseArea', points: [{ x: 0, y: 900 }], r: 5 } }),
    );
    b.ws.send(JSON.stringify({ type: 'cursor', x: 3, y: 3 }));
    expect(await a.next()).toMatchObject({ type: 'cursor', x: 3, y: 3 });
  });

  it('付箋の作成・移動・編集が同期され、SQLite に永続化される', async () => {
    const a = await connect('sticky-board', 'はなこ');
    await a.next(); // snapshot
    const b = await connect('sticky-board', 'たろう', 'blue');
    await b.next(); // snapshot
    await a.next(); // join presence

    const sticky = {
      id: 'note-1',
      x: 100,
      y: 120,
      color: 'rose',
      text: 'こんにちは',
      w: 180,
      h: 140,
      fontSize: 15,
    };
    a.ws.send(JSON.stringify({ type: 'op', op: { type: 'addSticky', sticky } }));
    expect(await b.next()).toEqual({ type: 'op', op: { type: 'addSticky', sticky } });

    // ドラッグ移動の同期
    b.ws.send(
      JSON.stringify({ type: 'op', op: { type: 'moveSticky', id: 'note-1', x: 300, y: 40 } }),
    );
    expect(await a.next()).toMatchObject({ type: 'op', op: { type: 'moveSticky', x: 300, y: 40 } });

    // テキスト編集の同期
    a.ws.send(
      JSON.stringify({ type: 'op', op: { type: 'editSticky', id: 'note-1', text: 'かきなおし' } }),
    );
    expect(await b.next()).toMatchObject({
      type: 'op',
      op: { type: 'editSticky', text: 'かきなおし' },
    });

    // サイズ・文字サイズ変更の同期
    a.ws.send(
      JSON.stringify({
        type: 'op',
        op: { type: 'resizeSticky', id: 'note-1', w: 240, h: 200, fontSize: 22 },
      }),
    );
    expect(await b.next()).toMatchObject({
      type: 'op',
      op: { type: 'resizeSticky', w: 240, h: 200, fontSize: 22 },
    });

    // 後から入る C の snapshot に最新の付箋が含まれる (永続化)
    const c = await connect('sticky-board', 'じろう', 'yellow');
    const snapC = await c.next();
    if (snapC.type !== 'snapshot') return;
    expect(snapC.state.stickies).toEqual([
      {
        id: 'note-1',
        x: 300,
        y: 40,
        color: 'rose',
        text: 'かきなおし',
        w: 240,
        h: 200,
        fontSize: 22,
      },
    ]);
  });

  it('無効な op (存在しない id への erase) はブロードキャストされない', async () => {
    const a = await connect('noop-board', 'はなこ');
    await a.next(); // snapshot
    const b = await connect('noop-board', 'たろう', 'blue');
    await b.next(); // snapshot
    await a.next(); // join presence

    b.ws.send(JSON.stringify({ type: 'op', op: { type: 'eraseStroke', strokeId: 'nope' } }));
    b.ws.send(JSON.stringify({ type: 'cursor', x: 9, y: 9 }));
    // erase は届かず、後続の cursor が先頭に来る
    const msg = await a.next();
    expect(msg).toMatchObject({ type: 'cursor', x: 9, y: 9 });
  });

  it('ストローク上限を超えると SQLite からも古い順に間引かれる', async () => {
    const stub = env.BOARD.getByName('trim-board');
    await runInDurableObject(stub, async (instance: BoardDO, state) => {
      for (let i = 0; i < MAX_STROKES + 5; i++) {
        instance.applyAndPersist({
          type: 'addStroke',
          stroke: { id: `s${i}`, color: 'white', points: [{ x: i, y: i }] },
        });
      }
      const count = Number(state.storage.sql.exec('SELECT COUNT(*) AS c FROM strokes').one().c);
      expect(count).toBe(MAX_STROKES);
      // メモリキャッシュと SQLite の先頭が一致する (最古の 5 本が消えている)
      const first = state.storage.sql
        .exec('SELECT id FROM strokes ORDER BY seq ASC LIMIT 1')
        .one().id;
      expect(first).toBe('s5');
      expect(instance.board().strokes[0].id).toBe('s5');
      expect(instance.board().strokes).toHaveLength(MAX_STROKES);
    });
  });

  it(
    '満席 (100人) を超えるとスペクテータになり、op / cursor は無視され、スペクテータ上限で接続拒否',
    { timeout: 90_000 },
    async () => {
      const board = 'surge-board';
      const members: Inbox[] = [];
      for (let i = 0; i < MAX_CONNECTIONS; i++) {
        members.push(await connect(board, 'めんばー'));
      }
      const last = members[MAX_CONNECTIONS - 1];
      const snapLast = await last.next();
      expect(snapLast.type).toBe('snapshot');
      if (snapLast.type !== 'snapshot') return;
      expect(snapLast.full).toBe(false);
      expect(snapLast.users).toHaveLength(MAX_CONNECTIONS);

      // 101 人目はスペクテータ (満席・読み取り専用)。join はブロードキャストされない
      const spec = await connect(board, 'けんがく');
      const snapSpec = await spec.next();
      expect(snapSpec.type).toBe('snapshot');
      if (snapSpec.type !== 'snapshot') return;
      expect(snapSpec.full).toBe(true);
      expect(snapSpec.users).toHaveLength(MAX_CONNECTIONS); // 自分は参加者に含まれない

      // スペクテータの op / cursor は無視される。後から送った参加者の cursor だけが届く
      spec.ws.send(
        JSON.stringify({
          type: 'op',
          op: {
            type: 'addStroke',
            stroke: { id: 'spec-stroke', color: 'white', points: [{ x: 0, y: 0 }] },
          },
        }),
      );
      spec.ws.send(JSON.stringify({ type: 'cursor', x: 1, y: 2 }));
      members[0].ws.send(JSON.stringify({ type: 'cursor', x: 7, y: 8 }));
      // last が次に受け取るのは members[0] の cursor (スペクテータの分は破棄済み)
      const msgAtLast = await last.next();
      expect(msgAtLast).toMatchObject({ type: 'cursor', x: 7, y: 8 });
      // スペクテータは読み取り専用のライブビューとして受信はできる
      const msgAtSpec = await spec.next();
      expect(msgAtSpec).toMatchObject({ type: 'cursor', x: 7, y: 8 });

      // スペクテータの op は盤面にも永続化されていない
      const spec2 = await connect(board, 'けんがく');
      const snapSpec2 = await spec2.next();
      if (snapSpec2.type !== 'snapshot') return;
      expect(snapSpec2.state.strokes).toEqual([]);

      // スペクテータ上限 (MAX_SPECTATORS) を超えると close code 4003 で接続拒否される
      for (let i = 2; i < MAX_SPECTATORS; i++) {
        await connect(board, 'けんがく');
      }
      const rejected = await SELF.fetch(
        `https://example.com/ws/${board}?name=${encodeURIComponent('あふれた')}&color=red`,
        { headers: { Upgrade: 'websocket' } },
      );
      expect(rejected.status).toBe(101);
      const rejectedWs = rejected.webSocket;
      if (!rejectedWs) throw new Error('no webSocket on response');
      const closeCode = new Promise<number>((resolve) => {
        rejectedWs.addEventListener('close', (e) => resolve(e.code));
      });
      rejectedWs.accept();
      expect(await closeCode).toBe(CLOSE_CODE_FULL);
    },
  );

  it('reaction は ephemeral にブロードキャストされ、永続化されない', async () => {
    const a = await connect('reaction-board', 'はなこ');
    await a.next(); // snapshot
    const b = await connect('reaction-board', 'たろう', 'blue');
    const snapB = await b.next(); // snapshot
    await a.next(); // join presence
    if (snapB.type !== 'snapshot') return;

    b.ws.send(JSON.stringify({ type: 'reaction', emoji: '👏', x: 50, y: 60 }));
    const msg = await a.next();
    expect(msg).toEqual({
      type: 'reaction',
      userId: snapB.self.id,
      emoji: '👏',
      x: 50,
      y: 60,
    });

    // 永続化されない: 後から入る C の snapshot は盤面のみ
    const c = await connect('reaction-board', 'じろう', 'yellow');
    const snapC = await c.next();
    if (snapC.type !== 'snapshot') return;
    expect(snapC.state).toEqual({ strokes: [], stickies: [] });
  });

  it('スキーマ検証に失敗するメッセージは黙って破棄される', async () => {
    const a = await connect('drop-board', 'はなこ');
    await a.next(); // snapshot
    const b = await connect('drop-board', 'たろう', 'blue');
    await b.next(); // snapshot
    await a.next(); // join presence

    b.ws.send('not-json');
    b.ws.send(JSON.stringify({ type: 'hack', x: 1, y: 2 }));
    b.ws.send(JSON.stringify({ type: 'cursor', x: 'NaN', y: 0 }));
    // 破棄された後に正常なメッセージだけが届く
    b.ws.send(JSON.stringify({ type: 'cursor', x: 1, y: 2 }));
    const msg = await a.next();
    expect(msg).toMatchObject({ type: 'cursor', x: 1, y: 2 });
  });
});
