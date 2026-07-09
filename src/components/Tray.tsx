import { Eraser, StickyNote, Undo2 } from 'lucide-react';
import { REACTION_EMOJIS, type ReactionEmoji } from '../../shared/schema';
import { useStore, type ChalkColor } from '../store/store';

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
  // 満席 (読み取り専用) と再接続中は操作を受け付けない
  const full = fullBoard || status !== 'open';

  return (
    <nav className="tray" aria-label="チョーク受け">
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
        className="tool-btn"
        aria-label="取り消し (自分の直近のストローク)"
        disabled={!canUndo || full}
        onClick={onUndo}
      >
        <Undo2 size={16} aria-hidden />
        <span className="tool-label">とりけし</span>
      </button>
      <button
        type="button"
        className={`tool-btn${tool === 'sticky' ? ' on' : ''}`}
        aria-label="画用紙 (付箋)"
        aria-pressed={tool === 'sticky'}
        disabled={full}
        onClick={() => setTool(tool === 'sticky' ? 'chalk' : 'sticky')}
      >
        <StickyNote size={16} aria-hidden />
        <span className="tool-label">画用紙</span>
      </button>
      <span className="tray-gap" aria-hidden />
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
    </nav>
  );
}
