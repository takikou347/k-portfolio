import { useEffect, useRef, useState, type ReactNode } from 'react';
import BoardCanvas from '../board/BoardCanvas';
import { screenToBoard, type Point } from '../board/view';
import { setLastCursor } from '../lib/cursor-tracker';
import { useStore } from '../store/store';

type Props = {
  children?: ReactNode;
};

function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
  );
}

/**
 * 黒板の盤面。パン (Space+ドラッグ / 2本指) とズーム (ホイール / ピンチ) を担当し、
 * children (canvas・付箋・カーソル) をボード座標系のレイヤーに載せる。
 */
export default function Stage({ children }: Props) {
  const view = useStore((s) => s.view);
  const tool = useStore((s) => s.tool);
  const spaceHeld = useStore((s) => s.spacePan);
  const stageRef = useRef<HTMLDivElement>(null);
  const [panning, setPanning] = useState(false);
  const pointers = useRef(new Map<number, Point>());
  const pan = useRef<{ mode: 'none' | 'space' | 'touch'; last: Point; lastDist: number }>({
    mode: 'none',
    last: { x: 0, y: 0 },
    lastDist: 0,
  });

  // Space キーでパンモード (フォーム入力中は無効)
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      // フォーカス中の付箋 (Space = 選択) やフォーム入力とは競合させない
      const onPaper = e.target instanceof HTMLElement && e.target.closest('.paper') !== null;
      if (e.code === 'Space' && !isEditable(e.target) && !onPaper) {
        e.preventDefault();
        useStore.getState().setSpacePan(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') useStore.getState().setSpacePan(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // ホイール = カーソル中心ズーム (非 passive で preventDefault する)
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * 0.0018);
      useStore.getState().zoomAtPoint({ x: e.clientX, y: e.clientY }, factor);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const centroidAndDist = (): { c: Point; d: number } => {
    const pts = [...pointers.current.values()];
    const c = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
    const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    return { c, d };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (e.pointerType === 'touch' && pointers.current.size === 2) {
      // 2本指: 描画を中断してパン/ピンチへ
      const { c, d } = centroidAndDist();
      pan.current = { mode: 'touch', last: c, lastDist: d };
      useStore.getState().setGestureActive(true);
      setPanning(true);
      return;
    }
    if (e.pointerType === 'mouse' && (spaceHeld || e.button === 1)) {
      pan.current = { mode: 'space', last: { x: e.clientX, y: e.clientY }, lastDist: 0 };
      stageRef.current?.setPointerCapture(e.pointerId);
      useStore.getState().setGestureActive(true);
      setPanning(true);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const store = useStore.getState();
    // 自分のカーソル位置を共有 (ボード座標、80ms スロットルは接続側で行う)
    if (e.isPrimary && pointers.current.size <= 1) {
      const p = screenToBoard(store.view, { x: e.clientX, y: e.clientY });
      setLastCursor(p);
      store.connection?.sendCursor(p.x, p.y);
    }
    if (pointers.current.has(e.pointerId)) {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    } else if (pan.current.mode !== 'space') {
      return;
    }
    if (pan.current.mode === 'touch' && pointers.current.size >= 2) {
      const { c, d } = centroidAndDist();
      store.panBy(c.x - pan.current.last.x, c.y - pan.current.last.y);
      if (pan.current.lastDist > 0 && d > 0) {
        store.zoomAtPoint(c, d / pan.current.lastDist);
      }
      pan.current.last = c;
      pan.current.lastDist = d;
    } else if (pan.current.mode === 'space') {
      store.panBy(e.clientX - pan.current.last.x, e.clientY - pan.current.last.y);
      pan.current.last = { x: e.clientX, y: e.clientY };
    }
  };

  const endPointer = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pan.current.mode === 'touch' && pointers.current.size < 2) {
      pan.current.mode = 'none';
      useStore.getState().setGestureActive(false);
      setPanning(false);
    }
    if (pan.current.mode === 'space') {
      pan.current.mode = 'none';
      useStore.getState().setGestureActive(false);
      setPanning(false);
    }
  };

  return (
    <div
      ref={stageRef}
      className={`stage tool-${tool}${spaceHeld || panning ? ' stage-panning' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
    >
      <BoardCanvas />
      <div
        className="board-objects"
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
      >
        {children}
      </div>
    </div>
  );
}
