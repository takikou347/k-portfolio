import { Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { CURSOR_THROTTLE_MS, STICKY_TEXT_MAX } from '../../shared/limits';
import type { Sticky } from '../../shared/schema';
import { screenToBoard, type Point } from '../board/view';
import { PAPER_COLORS, PAPER_LABELS } from '../lib/papers';
import { useStore } from '../store/store';

/** SP: 長押しでドラッグ開始 (スクロール/パンとの誤爆防止) */
const HOLD_MS = 450;
/** これ以上動いたらタップではなくドラッグ扱い (画面 px) */
const MOVE_THRESHOLD_PX = 6;

type DragState = {
  id: string;
  pointerId: number;
  /** ポインタ (ボード座標) と付箋左上のずれ */
  offset: Point;
  startClient: Point;
  moved: boolean;
  lastSent: number;
  /** touch: 長押し成立まではドラッグしない */
  armed: boolean;
};

/** 画用紙の付箋レイヤー (DOM)。ドラッグ移動は 80ms スロットルで moveSticky を送る */
export default function StickyLayer() {
  const stickies = useStore((s) => s.board.stickies);
  const full = useStore((s) => s.full);
  const status = useStore((s) => s.status);
  const editRequestId = useStore((s) => s.editRequestId);
  // 満席 (読み取り専用) と再接続中は操作させない (op が無音で消えるのを防ぐ)
  const locked = full || status !== 'open';
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dragPos, setDragPos] = useState<(Point & { id: string }) | null>(null);
  const [snapId, setSnapId] = useState<string | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 作成直後の「その場で編集」リクエストを消費する
  useEffect(() => {
    if (editRequestId) {
      setEditingId(editRequestId);
      setSelectedId(editRequestId);
      useStore.getState().requestStickyEdit(null);
    }
  }, [editRequestId]);

  const commitMove = (id: string, x: number, y: number) => {
    useStore.getState().applyLocalOp({ type: 'moveSticky', id, x, y });
  };

  const boardPoint = (e: React.PointerEvent): Point => {
    const { view } = useStore.getState();
    return screenToBoard(view, { x: e.clientX, y: e.clientY });
  };

  const startDrag = (e: React.PointerEvent, sticky: Sticky) => {
    const p = boardPoint(e);
    dragRef.current = {
      id: sticky.id,
      pointerId: e.pointerId,
      offset: { x: p.x - sticky.x, y: p.y - sticky.y },
      startClient: { x: e.clientX, y: e.clientY },
      moved: false,
      lastSent: 0,
      armed: e.pointerType !== 'touch',
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (e.pointerType === 'touch') {
      holdTimerRef.current = setTimeout(() => {
        holdTimerRef.current = null;
        const d = dragRef.current;
        if (d) {
          d.armed = true;
          setDragPos({ id: d.id, x: sticky.x, y: sticky.y });
        }
      }, HOLD_MS);
    }
  };

  const onPointerDown = (e: React.PointerEvent, sticky: Sticky) => {
    if (locked || !e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
    // Stage 側のパン/カーソル処理にこのポインタを渡さない (ドラッグとパンの衝突防止)
    e.stopPropagation();
    if (editingId === sticky.id) return; // 編集中はドラッグしない
    startDrag(e, sticky);
  };

  const onPointerMove = (e: React.PointerEvent, sticky: Sticky) => {
    const d = dragRef.current;
    if (!d || d.id !== sticky.id || e.pointerId !== d.pointerId) return;
    e.stopPropagation();
    const movedFar =
      Math.hypot(e.clientX - d.startClient.x, e.clientY - d.startClient.y) > MOVE_THRESHOLD_PX;
    if (!d.armed) {
      // 長押し前に動いたらタップ/ドラッグどちらでもない → キャンセル
      if (movedFar && holdTimerRef.current !== null) {
        clearTimeout(holdTimerRef.current);
        holdTimerRef.current = null;
        dragRef.current = null;
      }
      return;
    }
    if (movedFar) d.moved = true;
    if (!d.moved) return;
    const p = boardPoint(e);
    const x = p.x - d.offset.x;
    const y = p.y - d.offset.y;
    setDragPos({ id: d.id, x, y });
    const now = Date.now();
    if (now - d.lastSent >= CURSOR_THROTTLE_MS) {
      d.lastSent = now;
      commitMove(d.id, x, y);
    }
  };

  const onPointerEnd = (e: React.PointerEvent, sticky: Sticky) => {
    const d = dragRef.current;
    if (holdTimerRef.current !== null) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (!d || d.id !== sticky.id) return;
    e.stopPropagation();
    dragRef.current = null;
    if (d.armed && d.moved) {
      const p = boardPoint(e);
      commitMove(d.id, p.x - d.offset.x, p.y - d.offset.y);
      setDragPos(null);
      // ドロップでピタッと吸着
      setSnapId(d.id);
      setTimeout(() => setSnapId(null), 160);
      return;
    }
    setDragPos(null);
    // タップ / クリック = 選択 (SP はボトムシートを開く)
    if (e.pointerType === 'touch') {
      useStore.getState().setSheetSticky(sticky.id);
    } else {
      setSelectedId((prev) => (prev === sticky.id ? null : sticky.id));
    }
  };

  const commitText = (id: string, text: string) => {
    useStore.getState().applyLocalOp({ type: 'editSticky', id, text });
    setEditingId(null);
  };

  return (
    <>
      {stickies.map((sticky) => {
        const dragging = dragPos?.id === sticky.id;
        const pos = dragging ? dragPos : sticky;
        const selected = selectedId === sticky.id;
        return (
          <div
            key={sticky.id}
            className={`paper paper-${sticky.color}${dragging ? ' drag' : ''}${
              snapId === sticky.id ? ' snap' : ''
            }`}
            style={{ left: pos.x, top: pos.y }}
            data-sticky-id={sticky.id}
            onPointerDown={(e) => onPointerDown(e, sticky)}
            onPointerMove={(e) => onPointerMove(e, sticky)}
            onPointerUp={(e) => onPointerEnd(e, sticky)}
            onPointerCancel={() => {
              dragRef.current = null;
              setDragPos(null);
            }}
            onDoubleClick={() => {
              if (!locked) setEditingId(sticky.id);
            }}
            tabIndex={0}
            role="button"
            aria-label={`付箋: ${sticky.text || '(からっぽ)'}。Enter で編集、Space で選択、Delete で削除`}
            onKeyDown={(e) => {
              if (locked || editingId === sticky.id || e.target !== e.currentTarget) return;
              if (e.key === 'Enter') {
                e.preventDefault();
                setSelectedId(sticky.id);
                setEditingId(sticky.id);
              } else if (e.key === ' ') {
                e.preventDefault();
                setSelectedId((prev) => (prev === sticky.id ? null : sticky.id));
              } else if (e.key === 'Delete' || e.key === 'Backspace') {
                e.preventDefault();
                useStore.getState().applyLocalOp({ type: 'deleteSticky', id: sticky.id });
              }
            }}
          >
            {editingId === sticky.id ? (
              <textarea
                className="paper-editor"
                defaultValue={sticky.text}
                maxLength={STICKY_TEXT_MAX}
                autoFocus
                aria-label="付箋のテキスト"
                onFocus={(e) => e.currentTarget.select()}
                onBlur={(e) => commitText(sticky.id, e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    commitText(sticky.id, e.currentTarget.value);
                  }
                }}
              />
            ) : (
              <span className="paper-text">{sticky.text}</span>
            )}
            {selected && !locked && (
              <div className="sticky-controls" role="toolbar" aria-label="付箋の操作">
                {PAPER_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`paper-color-btn paper-${color}${
                      sticky.color === color ? ' on' : ''
                    }`}
                    aria-label={`画用紙を${PAPER_LABELS[color]}色にする`}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() =>
                      useStore.getState().applyLocalOp({
                        type: 'recolorSticky',
                        id: sticky.id,
                        color,
                      })
                    }
                  />
                ))}
                <button
                  type="button"
                  className="paper-delete-btn"
                  aria-label="付箋を削除"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => {
                    useStore.getState().applyLocalOp({ type: 'deleteSticky', id: sticky.id });
                    setSelectedId(null);
                  }}
                >
                  <Trash2 size={14} aria-hidden />
                </button>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
