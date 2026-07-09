import { useStore } from '../store/store';

/** 空の黒板に薄いチョークで出すヒント。誰かが最初のストロークを描いたら消える */
export default function Placeholder() {
  const hasStrokes = useStore((s) => s.board.strokes.length > 0);
  if (hasStrokes) return null;
  return (
    <p className="placeholder" aria-hidden>
      じゆうに かいてね
    </p>
  );
}
