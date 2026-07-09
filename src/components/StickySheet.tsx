import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { STICKY_TEXT_MAX } from '../../shared/limits';
import { PAPER_COLORS } from '../lib/papers';
import { useStore } from '../store/store';

/**
 * SP 用のボトムシート: 付箋のテキスト・色・削除をまとめる。
 * transform されたボード層の外 (App 直下) に置くこと (fixed が効かなくなるため)。
 */
export default function StickySheet() {
  const sheetStickyId = useStore((s) => s.sheetStickyId);
  const sticky = useStore((s) => s.board.stickies.find((n) => n.id === s.sheetStickyId));
  const setSheetSticky = useStore((s) => s.setSheetSticky);
  // 開いている間に満席/再接続へ遷移したら操作を止める (op は applyLocalOp 側でも破棄される)
  const locked = useStore((s) => s.full || s.status !== 'open');
  const [draft, setDraft] = useState<string | null>(null);

  if (!sheetStickyId || !sticky) return null;

  const close = () => {
    const text = draft ?? sticky.text;
    if (!locked && text !== sticky.text) {
      useStore.getState().applyLocalOp({ type: 'editSticky', id: sticky.id, text });
    }
    setDraft(null);
    setSheetSticky(null);
  };

  return (
    <>
      <button type="button" className="sheet-overlay" aria-label="編集を閉じる" onClick={close} />
      <div className="sticky-sheet" role="dialog" aria-label="付箋の編集">
        <textarea
          value={draft ?? sticky.text}
          maxLength={STICKY_TEXT_MAX}
          rows={3}
          autoFocus
          disabled={locked}
          aria-label="付箋のテキスト"
          onChange={(e) => setDraft(e.target.value)}
        />
        <div className="sticky-sheet-actions">
          {PAPER_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              className={`paper-color-btn paper-${color}${sticky.color === color ? ' on' : ''}`}
              aria-label={`付箋の色を変える (${color})`}
              disabled={locked}
              onClick={() =>
                useStore.getState().applyLocalOp({ type: 'recolorSticky', id: sticky.id, color })
              }
            />
          ))}
          <span className="sticky-sheet-spacer" aria-hidden />
          <button
            type="button"
            className="paper-delete-btn"
            aria-label="付箋を削除"
            disabled={locked}
            onClick={() => {
              useStore.getState().applyLocalOp({ type: 'deleteSticky', id: sticky.id });
              setDraft(null);
              setSheetSticky(null);
            }}
          >
            <Trash2 size={16} aria-hidden />
            けす
          </button>
          <button type="button" className="sticky-sheet-done" onClick={close}>
            できた
          </button>
        </div>
      </div>
    </>
  );
}
