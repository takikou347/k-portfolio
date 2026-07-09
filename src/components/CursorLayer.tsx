import { useStore } from '../store/store';

/** 他人のカーソル = 丸マグネット + 手書き風の名前ラベル (ボード座標レイヤーに置く) */
export default function CursorLayer() {
  const cursors = useStore((s) => s.cursors);
  const users = useStore((s) => s.users);
  const selfId = useStore((s) => s.self?.id);

  return (
    <>
      {Object.entries(cursors).map(([id, p]) => {
        if (id === selfId) return null;
        const user = users.find((u) => u.id === id);
        if (!user) return null;
        return (
          <div
            key={id}
            className="peer-cursor"
            style={{ transform: `translate(${p.x}px, ${p.y}px)` }}
          >
            <span className={`magnet-dot magnet-${user.color}`} aria-hidden />
            <span className="peer-cursor-name">{user.name}</span>
          </div>
        );
      })}
    </>
  );
}
