import { BoardDO } from './board-do';

export { BoardDO };

const BOARD_ID_RE = /^\/ws\/([A-Za-z0-9_-]{1,64})$/;

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
    // それ以外は SPA (static assets + SPA fallback)
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
