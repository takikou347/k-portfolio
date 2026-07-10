/** ボード ID の形式。DO 名 (`/ws/<boardId>`) としてそのまま使える文字だけを許す */
export const BOARD_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function isBoardId(value: string): boolean {
  return BOARD_ID_RE.test(value);
}

/** URL からボード ID を得る: /b/[boardId]、未指定 (/) や不正な形式は "main" */
export function boardIdFromPath(pathname: string): string {
  const match = /^\/b\/([^/]+)$/.exec(pathname);
  return match && isBoardId(match[1]) ? match[1] : 'main';
}

/**
 * 新しい黒板のランダム ID (8 文字)。URL を口頭や手書きで伝えても紛れないよう、
 * 見間違えやすい文字 (i/l/1/o/0) を除いた小文字英数字のみを使う
 */
export function randomBoardId(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  let id = '';
  for (const b of bytes) id += chars[b % chars.length];
  return id;
}
