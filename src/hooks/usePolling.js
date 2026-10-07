import { useEffect, useRef } from 'react';

/**
 * 定時輪詢，但只在分頁真的被看著的時候跑。
 *
 * 原本每個頁面各自 `setInterval`，分頁切到背景、手機鎖屏、PWA 收到背景都照打，
 * 每一輪都是一次 Firestore 讀取或一次後端請求。這個 hook 改成：
 *   - 分頁隱藏時停掉計時器
 *   - 回到前景時先立刻補抓一次（背景期間的資料一定過時），再重新開始計時
 *
 * @param {() => (void|Promise<void>)} callback 每輪要執行的抓取動作
 * @param {number|null} intervalMs 間隔毫秒；傳 null 只跑第一次不輪詢
 * @param {{ immediate?: boolean }} [options] immediate=false 時掛載當下不觸發
 */
export function usePolling(callback, intervalMs, { immediate = true } = {}) {
  // 用 ref 存 callback，呼叫端就不必自己 useCallback 才能避免重設計時器。
  // 寫入放在 effect 裡而非 render 期間，才不會在 concurrent render 被丟棄的
  // 那一次繪製中就改到共用的 ref。
  const savedCallback = useRef(callback);
  useEffect(() => { savedCallback.current = callback; }, [callback]);

  useEffect(() => {
    let timerId = null;
    // 卸載後若還有計時器 callback 在飛，用旗標擋掉，避免對已卸載的元件 setState。
    let disposed = false;

    const run = () => { if (!disposed) savedCallback.current(); };

    const start = () => {
      if (timerId !== null || !intervalMs) return;
      timerId = setInterval(run, intervalMs);
    };

    const stop = () => {
      if (timerId === null) return;
      clearInterval(timerId);
      timerId = null;
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        stop();
      } else {
        run();   // 補抓背景期間錯過的更新
        start();
      }
    };

    if (immediate) run();
    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      disposed = true;
      stop();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [intervalMs, immediate]);
}
