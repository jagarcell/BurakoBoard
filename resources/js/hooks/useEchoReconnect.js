import { useEffect, useRef } from 'react';

/**
 * useEchoReconnect
 *
 * Calls the provided `onReconnect` callback whenever the Pusher connection
 * underlying `window.Echo` transitions to the `connected` state from any
 * non-connected state (`disconnected`, `unavailable`, `failed`).
 *
 * On iOS Safari, the WebSocket is killed whenever the browser is backgrounded.
 * When the user unlocks the screen the socket eventually reconnects, but any
 * real-time event broadcast during the reconnection gap is permanently missed.
 * This hook closes that gap by re-fetching data as soon as the socket comes
 * back online.
 *
 * The callback is stored in a ref so callers can pass a `useCallback` value or
 * an inline function without causing the Pusher listener to be re-registered
 * on every render.
 *
 * The hook is a no-op when `window.Echo` is absent (SSR, test environments that
 * don't stub Echo, etc.).
 *
 * @param {Function} onReconnect  Called with no arguments each time the Pusher
 *                                connection re-establishes after a disconnection.
 * @returns {void}
 */
export default function useEchoReconnect(onReconnect) {
    const onReconnectRef = useRef(onReconnect);

    // Keep the ref in sync on every render without re-registering the listener.
    useEffect(() => {
        onReconnectRef.current = onReconnect;
    });

    useEffect(() => {
        if (typeof window === 'undefined' || ! window.Echo) return;

        const pusher = window.Echo.connector?.pusher;
        if (! pusher) return;

        let previousState = pusher.connection.state;

        const handleStateChange = ({ previous, current }) => {
            // Only fire when transitioning INTO `connected` from a truly
            // disconnected state.  Ignore `connecting` → `connected` on the
            // initial page load (previousState is `initialized` at that point).
            const wasDisconnected =
                previous === 'disconnected' ||
                previous === 'unavailable' ||
                previous === 'failed';

            if (wasDisconnected && current === 'connected') {
                onReconnectRef.current?.();
            }

            previousState = current; // eslint-disable-line react-hooks/exhaustive-deps -- safe: module-scoped variable, not used in dependency array
        };

        pusher.connection.bind('state_change', handleStateChange);

        return () => {
            pusher.connection.unbind('state_change', handleStateChange);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- safe: effect must run once; pusher connector is a singleton that never changes
    }, []);
}
