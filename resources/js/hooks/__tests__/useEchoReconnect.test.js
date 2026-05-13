import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useEchoReconnect from '@/hooks/useEchoReconnect';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal window.Echo stub that exposes the Pusher connection
 * state-change binding surface used by useEchoReconnect.
 *
 * @param {string} initialState  The initial Pusher connection state.
 * @returns {{ triggerStateChange: Function }} Helper to simulate state changes.
 */
function buildEchoMock(initialState = 'connected') {
    const listeners = {};

    const connectionStub = {
        state: initialState,
        bind: vi.fn((event, cb) => {
            listeners[event] = listeners[event] ?? [];
            listeners[event].push(cb);
        }),
        unbind: vi.fn((event, cb) => {
            if (listeners[event]) {
                listeners[event] = listeners[event].filter((fn) => fn !== cb);
            }
        }),
    };

    window.Echo = {
        connector: {
            pusher: {
                connection: connectionStub,
            },
        },
    };

    return {
        /**
         * Simulate a Pusher state_change event.
         *
         * @param {string} previous  Previous connection state.
         * @param {string} current   New connection state.
         */
        triggerStateChange: (previous, current) => {
            connectionStub.state = current;
            (listeners['state_change'] ?? []).forEach((cb) => cb({ previous, current }));
        },
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useEchoReconnect', () => {
    afterEach(() => {
        delete window.Echo;
        vi.restoreAllMocks();
    });

    it('calls onReconnect when the socket transitions from disconnected to connected', () => {
        const { triggerStateChange } = buildEchoMock('disconnected');
        const onReconnect = vi.fn();

        renderHook(() => useEchoReconnect(onReconnect));

        act(() => triggerStateChange('disconnected', 'connected'));

        expect(onReconnect).toHaveBeenCalledTimes(1);
    });

    it('calls onReconnect when transitioning from unavailable to connected', () => {
        const { triggerStateChange } = buildEchoMock('unavailable');
        const onReconnect = vi.fn();

        renderHook(() => useEchoReconnect(onReconnect));

        act(() => triggerStateChange('unavailable', 'connected'));

        expect(onReconnect).toHaveBeenCalledTimes(1);
    });

    it('calls onReconnect when transitioning from failed to connected', () => {
        const { triggerStateChange } = buildEchoMock('failed');
        const onReconnect = vi.fn();

        renderHook(() => useEchoReconnect(onReconnect));

        act(() => triggerStateChange('failed', 'connected'));

        expect(onReconnect).toHaveBeenCalledTimes(1);
    });

    it('does NOT call onReconnect on the initial connecting → connected transition', () => {
        const { triggerStateChange } = buildEchoMock('connecting');
        const onReconnect = vi.fn();

        renderHook(() => useEchoReconnect(onReconnect));

        // Initial connection on page load — should not trigger a re-fetch.
        act(() => triggerStateChange('connecting', 'connected'));

        expect(onReconnect).not.toHaveBeenCalled();
    });

    it('does NOT call onReconnect when transitioning to a non-connected state', () => {
        const { triggerStateChange } = buildEchoMock('connected');
        const onReconnect = vi.fn();

        renderHook(() => useEchoReconnect(onReconnect));

        act(() => triggerStateChange('connected', 'disconnected'));
        act(() => triggerStateChange('disconnected', 'unavailable'));

        expect(onReconnect).not.toHaveBeenCalled();
    });

    it('calls onReconnect multiple times across multiple reconnection cycles', () => {
        const { triggerStateChange } = buildEchoMock('connected');
        const onReconnect = vi.fn();

        renderHook(() => useEchoReconnect(onReconnect));

        act(() => {
            triggerStateChange('connected', 'disconnected');
            triggerStateChange('disconnected', 'connected');
        });

        act(() => {
            triggerStateChange('connected', 'disconnected');
            triggerStateChange('disconnected', 'connected');
        });

        expect(onReconnect).toHaveBeenCalledTimes(2);
    });

    it('uses the latest callback without re-registering the Pusher listener', () => {
        const { triggerStateChange } = buildEchoMock('disconnected');
        const first = vi.fn();
        const second = vi.fn();

        const { rerender } = renderHook(({ cb }) => useEchoReconnect(cb), {
            initialProps: { cb: first },
        });

        rerender({ cb: second });

        const connection = window.Echo.connector.pusher.connection;
        // The listener must have been registered exactly once.
        expect(connection.bind).toHaveBeenCalledTimes(1);

        act(() => triggerStateChange('disconnected', 'connected'));

        expect(first).not.toHaveBeenCalled();
        expect(second).toHaveBeenCalledTimes(1);
    });

    it('unbinds the Pusher listener on unmount', () => {
        const { triggerStateChange } = buildEchoMock('disconnected');
        const onReconnect = vi.fn();

        const { unmount } = renderHook(() => useEchoReconnect(onReconnect));

        const connection = window.Echo.connector.pusher.connection;

        unmount();

        expect(connection.unbind).toHaveBeenCalledWith('state_change', expect.any(Function));

        // Firing after unmount must not call the callback.
        act(() => triggerStateChange('disconnected', 'connected'));

        expect(onReconnect).not.toHaveBeenCalled();
    });

    it('is a no-op when window.Echo is absent', () => {
        delete window.Echo;
        const onReconnect = vi.fn();

        expect(() => {
            const { unmount } = renderHook(() => useEchoReconnect(onReconnect));
            unmount();
        }).not.toThrow();

        expect(onReconnect).not.toHaveBeenCalled();
    });

    it('is a no-op when Echo has no connector', () => {
        window.Echo = {};
        const onReconnect = vi.fn();

        expect(() => {
            const { unmount } = renderHook(() => useEchoReconnect(onReconnect));
            unmount();
        }).not.toThrow();

        expect(onReconnect).not.toHaveBeenCalled();
    });

    it('does not throw when onReconnect is undefined', () => {
        const { triggerStateChange } = buildEchoMock('disconnected');

        expect(() => {
            const { unmount } = renderHook(() => useEchoReconnect(undefined));
            act(() => triggerStateChange('disconnected', 'connected'));
            unmount();
        }).not.toThrow();
    });
});
