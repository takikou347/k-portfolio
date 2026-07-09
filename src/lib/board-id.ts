/** URL からボード ID を得る: /b/[boardId]、未指定 (/) は "main" */
export function boardIdFromPath(pathname: string): string {
  const match = /^\/b\/([A-Za-z0-9_-]{1,64})$/.exec(pathname);
  return match ? match[1] : 'main';
}
