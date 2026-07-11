import { Eraser, StickyNote, Trash2, Undo2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { REACTION_EMOJIS, type ReactionEmoji } from '../../shared/schema';
import { useStore, type ChalkColor } from '../store/store';

/** 「ぜんぶ消す」の確認状態を自動で解除するまでの時間 (ms) */
const CLEAR_CONFIRM_MS = 3000;

const CHALKS: { color: ChalkColor; label: string }[] = [
  { color: 'white', label: '白チョーク' },
  { color: 'pink', label: '桃チョーク' },
  { color: 'yellow', label: '黄チョーク' },
  { color: 'blue', label: '青チョーク' },
];

type Props = {
  onUndo?: () => void;
  canUndo?: boolean;
  onReact?: (emoji: ReactionEmoji) => void;
};

/** 下枠 = チョーク受け。ツールバーを兼ねる */
export default function Tray({ onUndo, canUndo = false, onReact }: Props) {
  const tool = useStore((s) => s.tool);
  const chalkColor = useStore((s) => s.chalkColor);
  const setTool = useStore((s) => s.setTool);
  const setChalkColor = useStore((s) => s.setChalkColor);
  const fullBoard = useStore((s) => s.full);
  const status = useStore((s) => s.status);
  const deleted = useStore((s) => s.deleted);
  const hasStrokes = useStore((s) => s.board.strokes.length > 0);
  // 満席 (読み取り専用)・削除済み・再接続中は操作を受け付けない
  const full = fullBoard || deleted || status !== 'open';

  // 「ぜんぶ消す」は全員の落書きが消えるため、確認の 2 度押しを要求する
  const [confirmClear, setConfirmClear] = useState(false);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disarmClear = () => {
    if (confirmTimerRef.current !== null) {
      clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = null;
    }
    setConfirmClear(false);
  };
  // アンマウント後に確認解除タイマーが発火しないように (依存なしで済むよう ref だけ触る)
  useEffect(
    () => () => {
      if (confirmTimerRef.current !== null) clearTimeout(confirmTimerRef.current);
    },
    [],
  );
  const onClearClick = () => {
    if (!confirmClear) {
      setConfirmClear(true);
      confirmTimerRef.current = setTimeout(disarmClear, CLEAR_CONFIRM_MS);
      return;
    }
    disarmClear();
    useStore.getState().applyLocalOp({ type: 'clearStrokes' });
  };

  return (
    <>
      <nav className="tray" aria-label="チョーク受け">
        <div className="tray-group" role="group" aria-label="チョークの色">
          {CHALKS.map(({ color, label }) => {
            const active = tool === 'chalk' && chalkColor === color;
            return (
              <button
                key={color}
                type="button"
                className={`chalk-btn${active ? ' on' : ''}`}
                aria-label={label}
                aria-pressed={active}
                disabled={full}
                onClick={() => setChalkColor(color)}
              >
                <span className={`chalk chalk-${color}`} aria-hidden />
              </button>
            );
          })}
        </div>

        <span className="tray-sep" aria-hidden />

        <div className="tray-group" role="group" aria-label="消しゴム・とりけし">
          <button
            type="button"
            className={`tool-btn${tool === 'eraser' ? ' on' : ''}`}
            aria-label="黒板消し"
            aria-pressed={tool === 'eraser'}
            disabled={full}
            onClick={() => setTool(tool === 'eraser' ? 'chalk' : 'eraser')}
          >
            <Eraser size={16} aria-hidden />
            <span className="tool-label">黒板消し</span>
          </button>
          <button
            type="button"
            className={`tool-btn${confirmClear ? ' confirm' : ''}`}
            aria-label={confirmClear ? 'もういちど押すとぜんぶ消えます' : 'ぜんぶ消す'}
            disabled={full || !hasStrokes}
            onClick={onClearClick}
            onBlur={disarmClear}
          >
            <Trash2 size={16} aria-hidden />
            <span className="tool-label">{confirmClear ? 'ほんとに?' : 'ぜんぶ消す'}</span>
          </button>
          <button
            type="button"
            className="tool-btn"
            aria-label="取り消し (自分の直近のストローク)"
            disabled={!canUndo || full}
            onClick={onUndo}
          >
            <Undo2 size={16} aria-hidden />
            <span className="tool-label">とりけし</span>
          </button>
        </div>

        <span className="tray-sep" aria-hidden />

        <div className="tray-group" role="group" aria-label="付箋">
          <button
            type="button"
            className={`tool-btn${tool === 'sticky' ? ' on' : ''}`}
            aria-label="付箋"
            aria-pressed={tool === 'sticky'}
            disabled={full}
            onClick={() => setTool(tool === 'sticky' ? 'chalk' : 'sticky')}
          >
            <StickyNote size={16} aria-hidden />
            <span className="tool-label">付箋</span>
          </button>
        </div>

        <span className="tray-sep" aria-hidden />

        <div className="tray-group tray-group-reactions" role="group" aria-label="リアクション">
          {REACTION_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="emoji-btn"
              aria-label={`リアクション ${emoji}`}
              disabled={full}
              onClick={() => onReact?.(emoji)}
            >
              {emoji}
            </button>
          ))}
        </div>
      </nav>
      {/* SP: 横スクロールできることを示す右端フェード */}
      <span className="tray-fade" aria-hidden />
    </>
  );
}
