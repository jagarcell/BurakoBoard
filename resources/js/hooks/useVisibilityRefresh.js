import { useEffect, useRef } from 'react';

/**
 * useVisibilityRefresh
 *
 * Calls the provided `onVisible` callback whenever the browser page transitions
 * from hidden to visible — which happens when a mobile user unlocks their screen,
 * switches back to the tab, or returns from the app switcher.
 *
 * The callback is stored in a ref so that callers can pass an inline function or
 * a `useCallback` value without triggering the `visibilitychange` listener to
 * be re-registered on every render.
 *
 * @param {Function} onVisible  Called with no arguments each time the page
 *                              becomes visible after having been hidden.
 * @returns {void}
 */
export default function useVisibilityRefresh(onVisible) {
    const onVisibleRef = useRef(onVisible);

    // Keep the ref in sync on every render without re-registering the listener.
    useEffect(() => {
        onVisibleRef.current = onVisible;
    });

    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                onVisibleRef.current?.();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps -- safe: intentionally empty; the listener must be registered once and relies on onVisibleRef for the latest callback
}
