import { isBoardId } from './board-id';

const BOARDS_KEY = 'kokuban:boards';

/** 訪問履歴に残す黒板の最大数 (古いものから押し出す) */
export const VISITED_BOARDS_MAX = 20;

/**
 * 訪問履歴に id を加えた新しいリストを返す (純関数)。
 * 先頭が最新・重複なし・不正な id は除外・上限超過は末尾から捨てる。
 */
export function pushVisited(list: string[], id: string): string[] {
  const cleaned = list.filter((b) => b !== id && isBoardId(b));
  if (!isBoardId(id)) return cleaned.slice(0, VISITED_BOARDS_MAX);
  return [id, ...cleaned].slice(0, VISITED_BOARDS_MAX);
}

export function loadVisitedBoards(): string[] {
  try {
    const raw = window.localStorage.getItem(BOARDS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((b): b is string => typeof b === 'string' && isBoardId(b));
  } catch {
    return [];
  }
}

/**
 * サーバーに黒板が実在するか問い合わせる (同名作成のバリデーション用)。
 * 確認できなかった場合は null — 呼び出し側は作成を止めずに続行してよい (ベストエフォート)
 */
export async function boardExists(id: string): Promise<boolean | null> {
  try {
    const res = await fetch(`/api/boards/${id}`);
    if (!res.ok) return null;
    const json = (await res.json()) as { exists?: unknown };
    return typeof json.exists === 'boolean' ? json.exists : null;
  } catch {
    return null;
  }
}

/** いまの黒板を訪問履歴の先頭に記録し、保存後のリストを返す */
export function recordBoardVisit(id: string): string[] {
  const next = pushVisited(loadVisitedBoards(), id);
  try {
    window.localStorage.setItem(BOARDS_KEY, JSON.stringify(next));
  } catch {
    // プライベートモード等で保存できなくても黒板の利用は続行する
  }
  return next;
}

/** 黒板を訪問履歴から外し、保存後のリストを返す */
export function removeVisitedBoard(id: string): string[] {
  const next = loadVisitedBoards().filter((b) => b !== id);
  try {
    window.localStorage.setItem(BOARDS_KEY, JSON.stringify(next));
  } catch {
    // 保存できなくても続行する
  }
  return next;
}

/** 黒板をサーバーからデータごと削除する。成功したら true */
export async function deleteBoard(id: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/boards/${id}`, { method: 'DELETE' });
    return res.ok;
  } catch {
    return false;
  }
}
