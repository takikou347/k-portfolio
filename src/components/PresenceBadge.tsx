import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/store';

/** 右上の接続人数表示。タップ/クリックで参加者の名前一覧がポップオーバーで見える */
export default function PresenceBadge() {
  const users = useStore((s) => s.users);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // 外側をクリック/タップしたら閉じる
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  return (
    <div className="presence" ref={rootRef}>
      <button
        type="button"
        className="presence-badge"
        aria-expanded={open}
        aria-label={`${users.length} 人が見ています。参加者一覧を開く`}
        onClick={() => setOpen((v) => !v)}
      >
        {users.length} 人が見ています
      </button>
      {open && (
        <ul className="presence-popover" aria-label="参加者">
          {users.map((u) => (
            <li key={u.id}>
              <span className={`magnet-dot magnet-${u.color}`} aria-hidden />
              <span className="presence-name">{u.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
