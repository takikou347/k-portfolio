import { Minus, Plus } from 'lucide-react';
import { useStore } from '../store/store';

/** 右下のズームコントロール (+ / − / 100% リセット)。タッチ操作の保険 */
export default function ZoomControls() {
  const scale = useStore((s) => s.view.scale);
  const zoomAtPoint = useStore((s) => s.zoomAtPoint);
  const setScale = useStore((s) => s.setScale);
  const center = () => ({ x: window.innerWidth / 2, y: window.innerHeight / 2 });

  return (
    <div className="zoom-controls" role="group" aria-label="ズーム">
      <button type="button" aria-label="ズームイン" onClick={() => zoomAtPoint(center(), 1.2)}>
        <Plus size={16} aria-hidden />
      </button>
      <button
        type="button"
        className="zoom-reset"
        aria-label="ズームを100%に戻す"
        onClick={() => setScale(1, center())}
      >
        {Math.round(scale * 100)}%
      </button>
      <button
        type="button"
        aria-label="ズームアウト"
        onClick={() => zoomAtPoint(center(), 1 / 1.2)}
      >
        <Minus size={16} aria-hidden />
      </button>
    </div>
  );
}
