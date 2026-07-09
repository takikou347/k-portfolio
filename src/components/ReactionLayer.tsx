import { useMemo } from 'react';
import { useStore } from '../store/store';

/** 絵文字が浮かび上がり、チョークの粉がふわっと舞って消える (ボード座標レイヤー) */
export default function ReactionLayer() {
  const reactions = useStore((s) => s.reactions);
  return (
    <>
      {reactions.map((r) => (
        <ReactionPop key={r.key} seed={r.key} emoji={r.emoji} x={r.x} y={r.y} />
      ))}
    </>
  );
}

type PopProps = {
  seed: string;
  emoji: string;
  x: number;
  y: number;
};

function ReactionPop({ seed, emoji, x, y }: PopProps) {
  // 粉の配置は生成時に一度だけ決める
  const dust = useMemo(
    () =>
      Array.from({ length: 6 }, (_, i) => ({
        left: Math.sin(seed.charCodeAt(i % seed.length) + i * 2.3) * 16,
        delay: (i * 67) % 240,
      })),
    [seed],
  );
  return (
    <div className="reaction-pop" style={{ left: x, top: y }} aria-hidden>
      <span className="reaction-emoji">{emoji}</span>
      {dust.map((d, i) => (
        <span
          key={i}
          className="reaction-dust"
          style={{ left: d.left, animationDelay: `${d.delay}ms` }}
        />
      ))}
    </div>
  );
}
