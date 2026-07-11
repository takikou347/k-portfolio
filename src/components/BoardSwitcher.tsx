import { Plus, Presentation } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { isBoardId, randomBoardId } from '../lib/board-id';
import { boardExists, loadVisitedBoards, recordBoardVisit } from '../lib/boards';

type Props = { boardId: string };

/**
 * 左上の黒板スイッチャー。いまの黒板名を表示し、ポップオーバーから
 * 新しい黒板の作成・名前指定の移動・訪問履歴からの切り替えができる。
 * 移動はページ遷移 (/b/<id>) で行い、接続の張り替えはリロードに任せる。
 */
export default function BoardSwitcher({ boardId }: Props) {
  const [open, setOpen] = useState(false);
  const [boards, setBoards] = useState<string[]>(loadVisitedBoards);
  const [dest, setDest] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const go = (id: string) => window.location.assign(`/b/${id}`);

  /** 「つくる」: 同名の黒板が実在したらエラー。確認できない場合はベストエフォートで続行 */
  const onCreate = async () => {
    if (!isBoardId(dest) || checking) return;
    setChecking(true);
    const exists = await boardExists(dest);
    setChecking(false);
    if (exists === true) {
      setError('その名前はもう使われています');
      return;
    }
    go(dest);
  };

  // いまの黒板を訪問履歴へ記録する (再訪時は先頭へ繰り上げ)
  useEffect(() => {
    setBoards(recordBoardVisit(boardId));
  }, [boardId]);

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

  const visited = boards.filter((b) => b !== boardId);

  return (
    <div className="board-switcher" ref={rootRef}>
      <button
        type="button"
        className="board-badge"
        aria-expanded={open}
        aria-label={`いまの黒板: ${boardId}。黒板の切り替えを開く`}
        onClick={() => setOpen((v) => !v)}
      >
        <Presentation size={14} aria-hidden />
        <span className="board-badge-name">{boardId}</span>
      </button>
      {open && (
        <div className="board-popover">
          <form
            className="board-create"
            onSubmit={(e) => {
              e.preventDefault();
              void onCreate();
            }}
          >
            <input
              type="text"
              value={dest}
              onChange={(e) => {
                setDest(e.target.value.trim());
                setError(null);
              }}
              placeholder="黒板のなまえ"
              aria-label="黒板の名前"
              maxLength={64}
            />
            <div className="board-create-actions">
              <button type="submit" disabled={!isBoardId(dest) || checking}>
                {checking ? 'かくにん中…' : 'つくる'}
              </button>
              <button type="button" disabled={!isBoardId(dest)} onClick={() => go(dest)}>
                ひらく
              </button>
            </div>
            {error && (
              <p className="board-error" role="alert">
                {error}
              </p>
            )}
          </form>
          <button type="button" className="board-new-btn" onClick={() => go(randomBoardId())}>
            <Plus size={14} aria-hidden />
            おまかせでつくる
          </button>
          {visited.length > 0 && (
            <>
              <p className="board-popover-heading">さいきん行った黒板</p>
              <ul className="board-list" aria-label="さいきん行った黒板">
                {visited.map((b) => (
                  <li key={b}>
                    <a href={`/b/${b}`}>{b}</a>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
