import { Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ERASE_BATCH_MS } from '../../shared/limits';
import { useStore } from '../store/store';

type Props = {
  /** 満席・削除済み・再接続中はバーを開かせない */
  disabled: boolean;
};

/** 拭き取り対象の x 範囲 (バーを開いた時点の盤面内容で固定する)。null = バー非表示 */
type WipeRange = { start: number; end: number };

/** キーボード操作 1 回で進む割合 */
const KEY_STEP = 0.05;

/**
 * 「ぜんぶ消す」のスライド版。トレイのボタンで下部に拭き取りバーを開き、
 * ハンドルを右へスライドした分だけ盤面の左から拭き取る (wipeLeftOf op)。
 * ドラッグ量はスクリーン px をボード座標へ換算して 1:1 で進むため、盤面が
 * 画面より横に広ければその分だけ長くスライドする (何回かに分けてもよい)。
 * 途中でやめた位置までの消去はそのまま確定する。
 */
export default function WipeControl({ disabled }: Props) {
  const [range, setRange] = useState<WipeRange | null>(null);
  const [wipeX, setWipeX] = useState(0);
  const wipeXRef = useRef(0);
  const lastSentRef = useRef(-Infinity);
  const lastClientXRef = useRef(0);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasStrokes = useStore((s) => s.board.strokes.length > 0);

  /** 溜めた拭き取り位置を 1 つの wipeLeftOf op として送る (消えるものがある時だけ) */
  const flush = () => {
    if (flushTimerRef.current !== null) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    const x = wipeXRef.current;
    if (x <= lastSentRef.current) return;
    const { board, applyLocalOp } = useStore.getState();
    if (!board.strokes.some((s) => s.points.some((p) => p.x < x))) return;
    lastSentRef.current = x;
    applyLocalOp({ type: 'wipeLeftOf', x });
  };

  const scheduleFlush = () => {
    if (flushTimerRef.current !== null) return;
    flushTimerRef.current = setTimeout(flush, ERASE_BATCH_MS);
  };

  // アンマウント時は未送信分を送り切る (消えたはずの線が他人に残るのを防ぐ)
  useEffect(
    () => () => {
      if (flushTimerRef.current !== null) {
        clearTimeout(flushTimerRef.current);
        flush();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const close = () => {
    flush();
    setRange(null);
  };

  const openBar = () => {
    const strokes = useStore.getState().board.strokes;
    if (strokes.length === 0) return;
    let minX = Infinity;
    let maxX = -Infinity;
    for (const s of strokes) {
      for (const p of s.points) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
      }
    }
    // end に到達 = 全点が line より左 = 全消し
    setRange({ start: minX, end: maxX + 1 });
    wipeXRef.current = minX;
    lastSentRef.current = -Infinity;
    setWipeX(minX);
  };

  /** 拭き取り位置を進める (後戻りはしない)。全部消えたらバーを閉じる */
  const advanceTo = (x: number, r: WipeRange) => {
    const next = Math.min(r.end, Math.max(wipeXRef.current, x));
    if (next === wipeXRef.current) return;
    wipeXRef.current = next;
    setWipeX(next);
    if (next >= r.end) {
      flush();
      setRange(null);
      return;
    }
    scheduleFlush();
  };

  if (disabled && range !== null) {
    // 満席・切断などで操作できなくなったらバーを畳む (消去は送信済み分まで)
    setRange(null);
  }

  const progress = range ? (wipeX - range.start) / (range.end - range.start) : 0;
  const pct = `${Math.min(100, Math.max(0, progress * 100)).toFixed(1)}%`;

  return (
    <>
      <button
        type="button"
        className={`tool-btn${range ? ' on' : ''}`}
        aria-label="ぜんぶ消す (スライドで消す)"
        aria-pressed={range !== null}
        disabled={disabled || !hasStrokes}
        onClick={() => (range ? close() : openBar())}
      >
        <Trash2 size={16} aria-hidden />
        <span className="tool-label">ぜんぶ消す</span>
      </button>
      {range && (
        <div className="wipe-bar">
          <p className="wipe-hint" aria-hidden>
            みぎへスライドしたぶんだけ、左から消えるよ
          </p>
          <div className="wipe-track">
            <div className="wipe-fill" style={{ width: pct }} aria-hidden />
            <button
              type="button"
              className="wipe-handle"
              style={{ left: pct }}
              role="slider"
              aria-label="拭き取りハンドル。右へスライドした分だけ左から消える"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress * 100)}
              onPointerDown={(e) => {
                if (!e.isPrimary) return;
                e.currentTarget.setPointerCapture(e.pointerId);
                lastClientXRef.current = e.clientX;
              }}
              onPointerMove={(e) => {
                if (!e.isPrimary || e.buttons === 0) return;
                const dx = e.clientX - lastClientXRef.current;
                lastClientXRef.current = e.clientX;
                if (dx <= 0) return;
                const { scale } = useStore.getState().view;
                advanceTo(wipeXRef.current + dx / scale, range);
              }}
              onPointerUp={flush}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight') {
                  e.preventDefault();
                  advanceTo(wipeXRef.current + (range.end - range.start) * KEY_STEP, range);
                }
              }}
            />
          </div>
          <button
            type="button"
            className="wipe-close"
            aria-label="拭き取りバーを閉じる"
            onClick={close}
          >
            <X size={14} aria-hidden />
          </button>
        </div>
      )}
    </>
  );
}
