import { describe, expect, it } from 'vitest';
import {
  clientMessageSchema,
  joinSchema,
  serverMessageSchema,
  userSchema,
} from '../../shared/schema';

describe('joinSchema (入室情報)', () => {
  it('2〜8文字の名前と有効な色を受け入れる', () => {
    expect(joinSchema.parse({ name: 'はなこ', color: 'red' })).toEqual({
      name: 'はなこ',
      color: 'red',
    });
    expect(joinSchema.safeParse({ name: 'ふた', color: 'blue' }).success).toBe(true);
    expect(joinSchema.safeParse({ name: 'はちもじのなまえ', color: 'pink' }).success).toBe(true);
  });

  it('1文字・9文字・不正な色は拒否する', () => {
    expect(joinSchema.safeParse({ name: 'あ', color: 'red' }).success).toBe(false);
    expect(joinSchema.safeParse({ name: 'きゅうもじのなまえだ', color: 'red' }).success).toBe(
      false,
    );
    expect(joinSchema.safeParse({ name: 'はなこ', color: 'magenta' }).success).toBe(false);
  });
});

describe('clientMessageSchema (受信メッセージ検証)', () => {
  it('cursor メッセージを受け入れる', () => {
    const msg = { type: 'cursor', x: 10.5, y: -3 };
    expect(clientMessageSchema.parse(msg)).toEqual(msg);
  });

  it('未知の type・欠けたフィールド・範囲外の座標は拒否する', () => {
    expect(clientMessageSchema.safeParse({ type: 'hack' }).success).toBe(false);
    expect(clientMessageSchema.safeParse({ type: 'cursor', x: 1 }).success).toBe(false);
    expect(clientMessageSchema.safeParse({ type: 'cursor', x: 1e9, y: 0 }).success).toBe(false);
    expect(clientMessageSchema.safeParse('not-an-object').success).toBe(false);
  });
});

describe('strokeSchema / op メッセージ', () => {
  const validStroke = {
    id: 's1',
    color: 'pink',
    points: [
      { x: 0, y: 0 },
      { x: 5, y: 5 },
    ],
  };

  it('addStroke op を受け入れる', () => {
    const msg = { type: 'op', op: { type: 'addStroke', stroke: validStroke } };
    expect(clientMessageSchema.safeParse(msg).success).toBe(true);
  });

  it('eraseStroke op を受け入れる', () => {
    const msg = { type: 'op', op: { type: 'eraseStroke', strokeId: 's1' } };
    expect(clientMessageSchema.safeParse(msg).success).toBe(true);
  });

  it('clearStrokes op を受け入れ、type の誤記は拒否する', () => {
    expect(
      clientMessageSchema.safeParse({ type: 'op', op: { type: 'clearStrokes' } }).success,
    ).toBe(true);
    expect(clientMessageSchema.safeParse({ type: 'op', op: { type: 'clearStroke' } }).success).toBe(
      false,
    );
  });

  it('不正な色・点数 0・点数超過のストロークは拒否する', () => {
    const base = { type: 'op', op: { type: 'addStroke', stroke: validStroke } };
    expect(
      clientMessageSchema.safeParse({
        ...base,
        op: { ...base.op, stroke: { ...validStroke, color: 'green' } },
      }).success,
    ).toBe(false);
    expect(
      clientMessageSchema.safeParse({
        ...base,
        op: { ...base.op, stroke: { ...validStroke, points: [] } },
      }).success,
    ).toBe(false);
    const tooMany = Array.from({ length: 601 }, (_, i) => ({ x: i, y: i }));
    expect(
      clientMessageSchema.safeParse({
        ...base,
        op: { ...base.op, stroke: { ...validStroke, points: tooMany } },
      }).success,
    ).toBe(false);
  });

  it('eraseArea op (部分消し) を受け入れる', () => {
    const msg = {
      type: 'op',
      op: {
        type: 'eraseArea',
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 3 },
        ],
        r: 22,
      },
    };
    expect(clientMessageSchema.safeParse(msg).success).toBe(true);
  });

  it('eraseArea は境界値 (r=1 / r=100 / 40 点) ちょうどを受け入れる', () => {
    const ok = (op: unknown) =>
      expect(clientMessageSchema.safeParse({ type: 'op', op }).success).toBe(true);
    ok({ type: 'eraseArea', points: [{ x: 0, y: 0 }], r: 1 });
    ok({ type: 'eraseArea', points: [{ x: 0, y: 0 }], r: 100 });
    const maxPoints = Array.from({ length: 40 }, (_, i) => ({ x: i, y: i }));
    ok({ type: 'eraseArea', points: maxPoints, r: 22 });
  });

  it('eraseArea の点数 0・点数超過・範囲外の半径は拒否する', () => {
    const ng = (op: unknown) =>
      expect(clientMessageSchema.safeParse({ type: 'op', op }).success).toBe(false);
    ng({ type: 'eraseArea', points: [], r: 22 });
    const tooMany = Array.from({ length: 41 }, (_, i) => ({ x: i, y: i }));
    ng({ type: 'eraseArea', points: tooMany, r: 22 });
    ng({ type: 'eraseArea', points: [{ x: 0, y: 0 }], r: 0.5 });
    ng({ type: 'eraseArea', points: [{ x: 0, y: 0 }], r: 101 });
  });

  it('付箋の op (add / move / edit / recolor / delete) を受け入れる', () => {
    const sticky = { id: 'n1', x: 10, y: 20, color: 'rose', text: 'こんにちは' };
    const ok = (op: unknown) =>
      expect(clientMessageSchema.safeParse({ type: 'op', op }).success).toBe(true);
    ok({ type: 'addSticky', sticky });
    ok({ type: 'moveSticky', id: 'n1', x: 1, y: 2 });
    ok({ type: 'editSticky', id: 'n1', text: '' });
    ok({ type: 'recolorSticky', id: 'n1', color: 'sky' });
    ok({ type: 'deleteSticky', id: 'n1' });
  });

  it('81 文字のテキスト・不正な画用紙色は拒否する', () => {
    const ng = (op: unknown) =>
      expect(clientMessageSchema.safeParse({ type: 'op', op }).success).toBe(false);
    ng({ type: 'editSticky', id: 'n1', text: 'あ'.repeat(81) });
    ng({
      type: 'addSticky',
      sticky: { id: 'n1', x: 0, y: 0, color: 'black', text: '' },
    });
  });

  it('w/h/fontSize の無い (旧) 付箋はデフォルト値が補完される (後方互換)', () => {
    const parsed = clientMessageSchema.safeParse({
      type: 'op',
      op: { type: 'addSticky', sticky: { id: 'n1', x: 10, y: 20, color: 'rose', text: '' } },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success && parsed.data.type === 'op' && parsed.data.op.type === 'addSticky') {
      expect(parsed.data.op.sticky).toMatchObject({ w: 180, h: 140, fontSize: 15 });
    }
  });

  it('resizeSticky op を受け入れ、範囲外の w/fontSize は拒否する', () => {
    const ok = (op: unknown) =>
      expect(clientMessageSchema.safeParse({ type: 'op', op }).success).toBe(true);
    const ng = (op: unknown) =>
      expect(clientMessageSchema.safeParse({ type: 'op', op }).success).toBe(false);
    ok({ type: 'resizeSticky', id: 'n1', w: 240, h: 200, fontSize: 22 });
    // 範囲外 (w が最大超過)
    ng({ type: 'resizeSticky', id: 'n1', w: 9999, h: 200, fontSize: 22 });
    // 範囲外 (fontSize が最小未満)
    ng({ type: 'resizeSticky', id: 'n1', w: 240, h: 200, fontSize: 4 });
    // 整数でない w
    ng({ type: 'resizeSticky', id: 'n1', w: 200.5, h: 200, fontSize: 22 });
  });

  it('reaction は 4 種の絵文字のみ受け入れる', () => {
    for (const emoji of ['👏', '✨', '💮', '❤️']) {
      expect(clientMessageSchema.safeParse({ type: 'reaction', emoji, x: 0, y: 0 }).success).toBe(
        true,
      );
    }
    expect(
      clientMessageSchema.safeParse({ type: 'reaction', emoji: '🔥', x: 0, y: 0 }).success,
    ).toBe(false);
  });

  it('stroking (描画中プレビュー) を受け入れる', () => {
    const msg = {
      type: 'stroking',
      strokeId: 's1',
      color: 'white',
      points: [{ x: 1, y: 2 }],
    };
    expect(clientMessageSchema.safeParse(msg).success).toBe(true);
  });
});

describe('serverMessageSchema', () => {
  const user = { id: 'u1', name: 'はなこ', color: 'red' };

  it('userSchema が id/name/color を検証する', () => {
    expect(userSchema.safeParse(user).success).toBe(true);
    expect(userSchema.safeParse({ ...user, id: '' }).success).toBe(false);
  });

  it('snapshot / presence / cursor / op を受け入れる', () => {
    expect(
      serverMessageSchema.safeParse({
        type: 'snapshot',
        self: user,
        users: [user],
        full: false,
        state: { strokes: [], stickies: [] },
      }).success,
    ).toBe(true);
    expect(
      serverMessageSchema.safeParse({
        type: 'op',
        op: { type: 'eraseStroke', strokeId: 's1' },
      }).success,
    ).toBe(true);
    expect(
      serverMessageSchema.safeParse({
        type: 'stroking',
        userId: 'u1',
        strokeId: 's1',
        color: 'white',
        points: [{ x: 1, y: 2 }],
      }).success,
    ).toBe(true);
    expect(
      serverMessageSchema.safeParse({ type: 'presence', event: 'join', user, users: [user] })
        .success,
    ).toBe(true);
    expect(
      serverMessageSchema.safeParse({ type: 'cursor', userId: 'u1', x: 0, y: 0 }).success,
    ).toBe(true);
  });

  it('presence の未知の event は拒否する', () => {
    expect(
      serverMessageSchema.safeParse({ type: 'presence', event: 'kick', user, users: [] }).success,
    ).toBe(false);
  });
});
