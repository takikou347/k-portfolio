import { BOARD_API_PER_WINDOW, BOARD_API_WINDOW_MS } from '../shared/limits';
import { BoardDO } from './board-do';

export { BoardDO };

const BOARD_ID_RE = /^\/ws\/([A-Za-z0-9_-]{1,64})$/;
const BOARD_API_RE = /^\/api\/boards\/([A-Za-z0-9_-]{1,64})$/;

/**
 * /api/boards への IP ごとの簡易レート制限 (アイソレートローカル)。
 * リクエストごとに任意の名前で DO を起動できてしまうため、無料枠を溶かす
 * 大量リクエストの防波堤として粗く絞る。アイソレートを跨いで厳密ではないが十分
 */
const apiHits = new Map<string, number[]>();
function allowBoardApi(ip: string, now: number): boolean {
  const hits = (apiHits.get(ip) ?? []).filter((t) => now - t < BOARD_API_WINDOW_MS);
  if (hits.length >= BOARD_API_PER_WINDOW) {
    apiHits.set(ip, hits);
    return false;
  }
  hits.push(now);
  // Map が際限なく成長しないよう、たまに丸ごと捨てる (捨てても安全側 = 許可が増えるだけ)
  if (apiHits.size > 1000) apiHits.clear();
  apiHits.set(ip, hits);
  return true;
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    const match = BOARD_ID_RE.exec(url.pathname);
    if (match) {
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
        return new Response('Expected WebSocket', { status: 426 });
      }
      // ボード ID から決定的に同じ DO へルーティングする
      return env.BOARD.getByName(match[1]).fetch(request);
    }
    // 黒板のメタ操作 (実在確認など)。WS と同じ DO へルーティングする
    const api = BOARD_API_RE.exec(url.pathname);
    if (api) {
      const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
      if (!allowBoardApi(ip, Date.now())) {
        return new Response('rate limited', { status: 429 });
      }
      return env.BOARD.getByName(api[1]).fetch(request);
    }
    // それ以外は SPA (static assets + SPA fallback)
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
