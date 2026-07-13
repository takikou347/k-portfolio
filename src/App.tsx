import { useEffect, useState } from 'react';
import type { Join } from '../shared/schema';
import { screenToBoard } from './board/view';
import Banner from './components/Banner';
import BoardSwitcher from './components/BoardSwitcher';
import CursorLayer from './components/CursorLayer';
import NameDialog from './components/NameDialog';
import Placeholder from './components/Placeholder';
import PresenceBadge from './components/PresenceBadge';
import ReactionLayer from './components/ReactionLayer';
import Stage from './components/Stage';
import StickyLayer from './components/StickyLayer';
import StickySheet from './components/StickySheet';
import Tray from './components/Tray';
import ZoomControls from './components/ZoomControls';
import { boardIdFromPath } from './lib/board-id';
import { getLastCursor } from './lib/cursor-tracker';
import { loadProfile, saveProfile } from './lib/profile';
import { useStore } from './store/store';
import { BoardConnection } from './ws/connection';

function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
  );
}

export default function App() {
  const boardId = boardIdFromPath(window.location.pathname);
  const [profile, setProfile] = useState<Join | null>(loadProfile);
  const canUndo = useStore((s) =>
    s.myStrokeIds.some((id) => s.board.strokes.some((st) => st.id === id)),
  );
  const undoLast = useStore((s) => s.undoLast);

  useEffect(() => {
    document.title = boardId === 'main' ? 'こくばん' : `こくばん — ${boardId}`;
  }, [boardId]);

  // Ctrl/Cmd+Z = 自分の直近ストロークの取り消し
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !isEditable(e.target)) {
        e.preventDefault();
        useStore.getState().undoLast();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!profile) return;
    const conn = new BoardConnection(boardId, profile, {
      onMessage: (msg) => useStore.getState().handleServerMessage(msg),
      onStatus: (status) => useStore.getState().setStatus(status),
      onFull: () => useStore.getState().markFull(),
      onDeleted: () => useStore.getState().markDeleted(),
    });
    conn.connect();
    useStore.getState().setConnection(conn);
    return () => {
      conn.close();
      useStore.getState().setConnection(null);
    };
  }, [profile, boardId]);

  return (
    <>
      <Stage>
        <StickyLayer />
        <ReactionLayer />
        <CursorLayer />
      </Stage>
      <Placeholder />
      <StickySheet />
      <Banner />
      <BoardSwitcher boardId={boardId} />
      <PresenceBadge />
      <ZoomControls />
      <Tray
        onUndo={undoLast}
        canUndo={canUndo}
        onReact={(emoji) => {
          const store = useStore.getState();
          // カーソル位置、なければ画面中央下 (ツールバーの上) から舞い上がる
          const pos =
            getLastCursor() ??
            screenToBoard(store.view, {
              x: window.innerWidth / 2 + (Math.random() - 0.5) * 160,
              y: window.innerHeight - 140,
            });
          store.sendReaction(emoji, pos);
        }}
      />
      {!profile && (
        <NameDialog
          onSubmit={(p) => {
            saveProfile(p);
            setProfile(p);
          }}
        />
      )}
    </>
  );
}
