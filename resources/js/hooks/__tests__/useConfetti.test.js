import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useConfetti from '@/hooks/useConfetti';

// Mock canvas-confetti so tests run in jsdom without a real canvas.
vi.mock('canvas-confetti', () => ({
    default: vi.fn(),
}));

import confetti from 'canvas-confetti';

describe('useConfetti', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('returns fire and burst functions', () => {
        const { result } = renderHook(() => useConfetti());

        expect(typeof result.current.fire).toBe('function');
        expect(typeof result.current.burst).toBe('function');
    });

    describe('fire()', () => {
        it('calls confetti twice immediately (left + right cannons)', () => {
            const { result } = renderHook(() => useConfetti());

            act(() => { result.current.fire(); });

            expect(confetti).toHaveBeenCalledTimes(2);
        });

        it('calls confetti a third time after 250 ms (centre burst)', () => {
            const { result } = renderHook(() => useConfetti());

            act(() => { result.current.fire(); });
            expect(confetti).toHaveBeenCalledTimes(2);

            act(() => { vi.advanceTimersByTime(250); });
            expect(confetti).toHaveBeenCalledTimes(3);
        });

        it('fires the left cannon from the bottom-left corner', () => {
            const { result } = renderHook(() => useConfetti());

            act(() => { result.current.fire(); });

            const leftCall = confetti.mock.calls[0][0];
            expect(leftCall.origin).toEqual({ x: 0, y: 1 });
            expect(leftCall.angle).toBe(60);
        });

        it('fires the right cannon from the bottom-right corner', () => {
            const { result } = renderHook(() => useConfetti());

            act(() => { result.current.fire(); });

            const rightCall = confetti.mock.calls[1][0];
            expect(rightCall.origin).toEqual({ x: 1, y: 1 });
            expect(rightCall.angle).toBe(120);
        });

        it('fires the delayed burst from the viewport centre', () => {
            const { result } = renderHook(() => useConfetti());

            act(() => { result.current.fire(); });
            act(() => { vi.advanceTimersByTime(250); });

            const centreBurst = confetti.mock.calls[2][0];
            expect(centreBurst.origin).toEqual({ x: 0.5, y: 0.7 });
            expect(centreBurst.angle).toBe(90);
        });

        it('renders above page content (zIndex 9999)', () => {
            const { result } = renderHook(() => useConfetti());

            act(() => { result.current.fire(); });

            for (const [opts] of confetti.mock.calls) {
                expect(opts.zIndex).toBe(9999);
            }
        });

        it('is stable across re-renders (same function reference)', () => {
            const { result, rerender } = renderHook(() => useConfetti());
            const first = result.current.fire;

            rerender();

            expect(result.current.fire).toBe(first);
        });

        it('does not throw even if confetti throws internally', () => {
            confetti.mockImplementationOnce(() => { throw new Error('canvas error'); });

            const { result } = renderHook(() => useConfetti());

            expect(() => act(() => { result.current.fire(); })).not.toThrow();
        });
    });

    describe('burst()', () => {
        it('calls confetti exactly once', () => {
            const { result } = renderHook(() => useConfetti());

            act(() => { result.current.burst(); });

            expect(confetti).toHaveBeenCalledTimes(1);
        });

        it('fires from the viewport centre', () => {
            const { result } = renderHook(() => useConfetti());

            act(() => { result.current.burst(); });

            const opts = confetti.mock.calls[0][0];
            expect(opts.origin).toEqual({ x: 0.5, y: 0.6 });
            expect(opts.angle).toBe(90);
        });

        it('renders above page content (zIndex 9999)', () => {
            const { result } = renderHook(() => useConfetti());

            act(() => { result.current.burst(); });

            expect(confetti.mock.calls[0][0].zIndex).toBe(9999);
        });

        it('is stable across re-renders (same function reference)', () => {
            const { result, rerender } = renderHook(() => useConfetti());
            const first = result.current.burst;

            rerender();

            expect(result.current.burst).toBe(first);
        });

        it('does not throw even if confetti throws internally', () => {
            confetti.mockImplementationOnce(() => { throw new Error('canvas error'); });

            const { result } = renderHook(() => useConfetti());

            expect(() => act(() => { result.current.burst(); })).not.toThrow();
        });

        it('can be called multiple times without error', () => {
            const { result } = renderHook(() => useConfetti());

            act(() => {
                result.current.burst();
                result.current.burst();
                result.current.burst();
            });

            expect(confetti).toHaveBeenCalledTimes(3);
        });
    });
});
