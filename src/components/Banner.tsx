import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/store';

/**
 * 上部のチョーク文字バナー。
 * 再接続中 =「つなぎなおしています…」/ 復帰後 1 秒「つながりました」/ 満席の案内
 */
export default function Banner() {
  const status = useStore((s) => s.status);
  const full = useStore((s) => s.full);
  const deleted = useStore((s) => s.deleted);
  const [recovered, setRecovered] = useState(false);
  const wasReconnecting = useRef(false);

  useEffect(() => {
    if (status === 'reconnecting') {
      wasReconnecting.current = true;
      setRecovered(false);
      return;
    }
    if (status === 'open' && wasReconnecting.current) {
      wasReconnecting.current = false;
      setRecovered(true);
      const timer = setTimeout(() => setRecovered(false), 1000);
      return () => clearTimeout(timer);
    }
  }, [status]);

  if (deleted) {
    return (
      <p className="banner" role="status">
        この黒板は削除されました。左上から別の黒板へどうぞ
      </p>
    );
  }
  if (full) {
    return (
      <p className="banner" role="status">
        いま満席です。しばらくしてから来てね
      </p>
    );
  }
  if (status === 'reconnecting') {
    return (
      <p className="banner" role="status">
        つなぎなおしています…
      </p>
    );
  }
  if (recovered) {
    return (
      <p className="banner banner-ok" role="status">
        つながりました
      </p>
    );
  }
  return null;
}
