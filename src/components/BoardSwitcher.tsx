import { Plus, Presentation } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { isBoardId, randomBoardId } from '../lib/board-id';
import { loadVisitedBoards, recordBoardVisit } from '../lib/boards';

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
  const rootRef = useRef<HTMLDivElement>(null);

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
          <button
            type="button"
            className="board-new-btn"
            onClick={() => window.location.assign(`/b/${randomBoardId()}`)}
          >
            <Plus size={14} aria-hidden />
            あたらしい黒板をつくる
          </button>
          <form
            className="board-goto"
            onSubmit={(e) => {
              e.preventDefault();
              if (isBoardId(dest)) window.location.assign(`/b/${dest}`);
            }}
          >
            <input
              type="text"
              value={dest}
              onChange={(e) => setDest(e.target.value.trim())}
              placeholder="なまえで移動"
              aria-label="黒板の名前"
              maxLength={64}
            />
            <button type="submit" disabled={!isBoardId(dest)}>
              いく
            </button>
          </form>
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
