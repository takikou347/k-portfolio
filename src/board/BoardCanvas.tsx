import { useEffect, useRef } from 'react';
import {
  MAX_STROKE_POINTS,
  STICKY_FONT_DEFAULT,
  STICKY_H_DEFAULT,
  STICKY_W_DEFAULT,
  STROKE_BATCH_MS,
} from '../../shared/limits';
import type { ChalkColor, Point } from '../../shared/schema';
import { useStore } from '../store/store';
import { chalkCssColor, drawStroke } from './chalk';
import { strokeHitsPoint } from './hit-test';
import { screenToBoard } from './view';

/**
 * 黒板消しの当たり半径 (画面 px。ズームに合わせてボード座標へ換算する)。
 * 実物のフェルト面は幅 5〜6cm ≒ 直径 44px 相当。半径 22px でその実寸に近づける。
 */
const ERASE_RADIUS_PX = 22;

type OwnDraft = { id: string; color: ChalkColor; points: Point[]; pending: Point[] };
type Particle = { x: number; y: number; vy: number; life: number; total: number };
/** 拭き跡。r = ボード座標での半径 (消しゴム幅と一致させ、帯状の跡に見せる) */
type Smudge = { x: number; y: number; r: number; life: number; total: number };

function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * チョークストロークの描画層。<canvas> 2D にストローク (確定分 + 描画中プレビュー) を描く。
 * 付箋・カーソルは DOM 側 (board-objects) が担当し、混在させない。
 */
export default function BoardCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const draftRef = useRef<OwnDraft | null>(null);
  const erasingRef = useRef(false);
  const particlesRef = useRef<Particle[]>([]);
  const smudgesRef = useRef<Smudge[]>([]);
  const dirtyRef = useRef(true);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // E2E とプレースホルダー判定のための描画本数フック
  const strokeCount = useStore((s) => s.board.strokes.length);
  // 黒板消し選択中はカーソルを実物の黒板消し (フェルト+木) にする
  const tool = useStore((s) => s.tool);

  // 盤面・プレビュー・ビューの変化で再描画をスケジュール
  useEffect(
    () =>
      useStore.subscribe((s, prev) => {
        if (s.board !== prev.board || s.drafts !== prev.drafts || s.view !== prev.view) {
          dirtyRef.current = true;
        }
      }),
    [],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const markDirty = () => {
      dirtyRef.current = true;
    };
    window.addEventListener('resize', markDirty);

    const render = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      const { view, board, drafts } = useStore.getState();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(dpr * view.scale, 0, 0, dpr * view.scale, dpr * view.x, dpr * view.y);

      for (const stroke of board.strokes) drawStroke(ctx, stroke);
      for (const [id, d] of Object.entries(drafts)) {
        drawStroke(ctx, { id, color: d.color, points: d.points });
      }
      const own = draftRef.current;
      if (own) drawStroke(ctx, own);

      // チョークの粉
      ctx.fillStyle = chalkCssColor('white');
      for (const p of particlesRef.current) {
        ctx.globalAlpha = Math.max(0, (p.life / p.total) * 0.9);
        ctx.fillRect(p.x, p.y, 1.6, 1.6);
      }
      // 黒板消しの拭き跡: 消しゴム幅の柔らかい円を重ね、帯状の擦れ跡として残す
      for (const s of smudgesRef.current) {
        const a = Math.max(0, s.life / s.total);
        const g = ctx.createRadialGradient(s.x, s.y, s.r * 0.25, s.x, s.y, s.r);
        g.addColorStop(0, `rgba(242, 240, 230, ${0.16 * a})`);
        g.addColorStop(0.7, `rgba(242, 240, 230, ${0.06 * a})`);
        g.addColorStop(1, 'rgba(242, 240, 230, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    let raf = 0;
    let last = performance.now();
    let lastPrune = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      // 粉と拭き跡のアニメーション
      if (particlesRef.current.length > 0 || smudgesRef.current.length > 0) {
        for (const p of particlesRef.current) {
          p.y += p.vy * dt;
          p.life -= dt;
        }
        for (const s of smudgesRef.current) s.life -= dt;
        particlesRef.current = particlesRef.current.filter((p) => p.life > 0);
        smudgesRef.current = smudgesRef.current.filter((s) => s.life > 0);
        dirtyRef.current = true;
      }
      if (now - lastPrune > 1000) {
        lastPrune = now;
        useStore.getState().pruneDrafts(Date.now());
      }
      if (dirtyRef.current) {
        dirtyRef.current = false;
        render();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', markDirty);
    };
  }, []);

  const flushPending = () => {
    const d = draftRef.current;
    if (!d || d.pending.length === 0) return;
    useStore
      .getState()
      .connection?.send({ type: 'stroking', strokeId: d.id, color: d.color, points: d.pending });
    d.pending = [];
  };

  const scheduleFlush = () => {
    if (flushTimerRef.current !== null) return;
    flushTimerRef.current = setTimeout(() => {
      flushTimerRef.current = null;
      flushPending();
    }, STROKE_BATCH_MS);
  };

  const cancelDraft = () => {
    if (flushTimerRef.current !== null) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    draftRef.current = null;
    dirtyRef.current = true;
  };

  const finishStroke = () => {
    const d = draftRef.current;
    if (!d) return;
    if (flushTimerRef.current !== null) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    draftRef.current = null;
    // 確定 op には全点を載せる (プレビューの取りこぼしがあっても最終形は一致する)
    useStore.getState().applyLocalOp({
      type: 'addStroke',
      stroke: { id: d.id, color: d.color, points: d.points },
    });
    dirtyRef.current = true;
  };

  const spawnDust = (p: Point, scale: number, n: number) => {
    if (reducedMotion()) return;
    for (let i = 0; i < n; i++) {
      particlesRef.current.push({
        x: p.x + ((Math.random() - 0.5) * 12) / scale,
        y: p.y + 4 / scale,
        vy: (18 + Math.random() * 22) / scale,
        life: 0.9,
        total: 0.9,
      });
    }
  };

  const eraseAt = (p: Point) => {
    const { board, view, applyLocalOp } = useStore.getState();
    const threshold = ERASE_RADIUS_PX / view.scale;
    const hit = board.strokes.find((s) => strokeHitsPoint(s, p, threshold));
    if (hit) {
      applyLocalOp({ type: 'eraseStroke', strokeId: hit.id });
      // 拭き取ったチョークの粉が舞う
      spawnDust(p, view.scale, 3);
    }
    // なぞった範囲に消しゴム幅ぶんの擦れ跡を残す (帯状に見える)
    if (!reducedMotion()) {
      smudgesRef.current.push({ x: p.x, y: p.y, r: threshold, life: 1.4, total: 1.4 });
      if (smudgesRef.current.length > 120) smudgesRef.current.shift();
    }
    dirtyRef.current = true;
  };

  const boardPoint = (e: React.PointerEvent): Point => {
    const { view } = useStore.getState();
    return screenToBoard(view, { x: e.clientX, y: e.clientY });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const store = useStore.getState();
    if (!e.isPrimary || e.button !== 0) return;
    // 満席 (読み取り専用) と再接続中は新しい操作を始めない (op が無音で消えるのを防ぐ)
    if (store.gestureActive || store.spacePan || store.full || store.status !== 'open') return;
    const p = boardPoint(e);
    if (store.tool === 'chalk') {
      canvasRef.current?.setPointerCapture(e.pointerId);
      draftRef.current = {
        id: crypto.randomUUID(),
        color: store.chalkColor,
        points: [p],
        pending: [p],
      };
      scheduleFlush();
      dirtyRef.current = true;
    } else if (store.tool === 'eraser') {
      canvasRef.current?.setPointerCapture(e.pointerId);
      erasingRef.current = true;
      eraseAt(p);
    } else if (store.tool === 'sticky') {
      // mousedown のデフォルト動作 (フォーカス移動) が開いた直後のエディタを blur しないように
      e.preventDefault();
      // 付箋をクリック位置に貼り、その場で編集を開く
      const sticky = {
        id: crypto.randomUUID(),
        x: p.x - STICKY_W_DEFAULT / 2,
        y: p.y - 40,
        color: 'cream' as const,
        text: '',
        w: STICKY_W_DEFAULT,
        h: STICKY_H_DEFAULT,
        fontSize: STICKY_FONT_DEFAULT,
      };
      store.applyLocalOp({ type: 'addSticky', sticky });
      store.setTool('chalk');
      if (e.pointerType === 'touch') {
        store.setSheetSticky(sticky.id);
      } else {
        store.requestStickyEdit(sticky.id);
      }
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const store = useStore.getState();
    // 2本指ジェスチャが始まったら誤描画しないよう描きかけを破棄する
    if (store.gestureActive) {
      if (draftRef.current) cancelDraft();
      erasingRef.current = false;
      return;
    }
    if (!e.isPrimary) return;
    const d = draftRef.current;
    if (d) {
      const p = boardPoint(e);
      const lastPt = d.points[d.points.length - 1];
      const minDist = 1.2 / store.view.scale;
      if (Math.hypot(p.x - lastPt.x, p.y - lastPt.y) < minDist) return;
      if (d.points.length >= MAX_STROKE_POINTS) return;
      d.points.push(p);
      d.pending.push(p);
      scheduleFlush();
      if (Math.random() < 0.3) spawnDust(p, store.view.scale, 1);
      dirtyRef.current = true;
    } else if (erasingRef.current && e.buttons > 0) {
      eraseAt(boardPoint(e));
    }
  };

  const onPointerEnd = () => {
    if (draftRef.current) finishStroke();
    erasingRef.current = false;
  };

  return (
    <canvas
      ref={canvasRef}
      className={`board-canvas${tool === 'eraser' ? ' tool-eraser' : ''}`}
      data-strokes={strokeCount}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={cancelDraft}
    />
  );
}
