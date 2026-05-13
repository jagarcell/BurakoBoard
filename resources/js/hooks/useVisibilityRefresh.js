import { useEffect, useRef } from 'react';

/**
 * useVisibilityRefresh
 *
 * Calls the provided `onVisible` callback whenever the browser page transitions
 * from hidden to visible — which happens when a mobile user unlocks their screen,
 * switches back to the tab, or returns from the app switcher.
 *
 * Also handles BFCache restoration: on iOS Safari the browser can freeze a page
 * entirely (running React `useEffect` cleanups and tearing down all WebSocket
 * subscriptions).  When the user navigates back, the page is "thawed" via a
 * `pageshow` event with `event.persisted === true`.  Because React effects do
 * not re-run after BFCache restoration, `visibilitychange` alone is not
 * sufficient — the `pageshow` path triggers the same re-fetch so stale state
 * is never shown after a BFCache restore.
 *
 * The callback is stored in a ref so that callers can pass an inline function or
 * a `useCallback` value without triggering the listeners to be re-registered on
 * every render.
 *
 * @param {Function} onVisible  Called with no arguments each time the page
 *                              becomes visible after having been hidden, or when
 *                              the page is restored from the BFCache.
 * @returns {void}
 */
export default function useVisibilityRefresh(onVisible) {
    const onVisibleRef = useRef(onVisible);

    // Keep the ref in sync on every render without re-registering the listeners.
    useEffect(() => {
        onVisibleRef.current = onVisible;
    });

    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                onVisibleRef.current?.();
            }
        };

        // `pageshow` with `event.persisted === true` fires when iOS Safari
        // restores a page from the Back-Forward Cache.  React effects do not
        // re-run after a BFCache restore, so Echo subscriptions set up in
        // useEffect are gone.  Calling onVisible here triggers re-fetching the
        // latest server state, bridging the gap until the socket reconnects and
        // the useEchoReconnect hook takes over.
        const handlePageShow = (event) => {
            if (event.persisted) {
                onVisibleRef.current?.();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('pageshow', handlePageShow);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('pageshow', handlePageShow);
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps -- safe: intentionally empty; listeners are registered once and rely on onVisibleRef for the latest callback
}
