import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useWinnerSound from '@/hooks/useWinnerSound';

describe('useWinnerSound', () => {
    let mockOscillator;
    let mockGain;
    let mockContext;

    beforeEach(() => {
        mockOscillator = {
            connect: vi.fn(),
            type: '',
            frequency: { setValueAtTime: vi.fn() },
            start: vi.fn(),
            stop: vi.fn(),
        };

        mockGain = {
            connect: vi.fn(),
            gain: {
                setValueAtTime: vi.fn(),
                linearRampToValueAtTime: vi.fn(),
            },
        };

        mockContext = {
            currentTime: 0,
            state: 'running',
            resume: vi.fn(() => Promise.resolve()),
            createOscillator: vi.fn(() => mockOscillator),
            createGain: vi.fn(() => mockGain),
            destination: {},
        };

        // Must use a regular function (not arrow) so the mock can be used as a
        // constructor; Object.assign copies methods by reference so assertions
        // on mockContext.createOscillator still track all calls.
        vi.stubGlobal('AudioContext', vi.fn(function () {
            Object.assign(this, mockContext);
        }));
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('returns unlock and play functions', () => {
        const { result } = renderHook(() => useWinnerSound());

        expect(typeof result.current.unlock).toBe('function');
        expect(typeof result.current.play).toBe('function');
    });

    it('creates an AudioContext and schedules five notes when play() is called', () => {
        const { result } = renderHook(() => useWinnerSound());

        act(() => { result.current.play(); });

        expect(window.AudioContext).toHaveBeenCalledTimes(1);
        expect(mockContext.createOscillator).toHaveBeenCalledTimes(5);
        expect(mockContext.createGain).toHaveBeenCalledTimes(5);
        expect(mockOscillator.start).toHaveBeenCalledTimes(5);
        expect(mockOscillator.stop).toHaveBeenCalledTimes(5);
    });

    it('connects each oscillator to its own gain node and the gain to the destination', () => {
        const { result } = renderHook(() => useWinnerSound());

        act(() => { result.current.play(); });

        expect(mockOscillator.connect).toHaveBeenCalledWith(mockGain);
        expect(mockGain.connect).toHaveBeenCalledWith(mockContext.destination);
    });

    it('sets oscillator type to sine', () => {
        const { result } = renderHook(() => useWinnerSound());

        act(() => { result.current.play(); });

        expect(mockOscillator.type).toBe('sine');
    });

    it('reuses the same AudioContext across multiple calls', () => {
        const { result } = renderHook(() => useWinnerSound());

        act(() => { result.current.play(); });
        act(() => { result.current.play(); });

        // AudioContext constructor called only once
        expect(window.AudioContext).toHaveBeenCalledTimes(1);
    });

    describe('unlock()', () => {
        let mockAudioPlay;
        let lastAudioInstance;

        beforeEach(() => {
            mockAudioPlay = vi.fn(() => Promise.resolve());
            vi.stubGlobal('Audio', vi.fn(function () {
                lastAudioInstance = this;
                this.play = mockAudioPlay;
                this.volume = 1;
            }));
        });

        it('creates the AudioContext and calls resume() when the context is suspended', () => {
            mockContext.state = 'suspended';
            const { result } = renderHook(() => useWinnerSound());

            act(() => { result.current.unlock(); });

            expect(window.AudioContext).toHaveBeenCalledTimes(1);
            expect(mockContext.resume).toHaveBeenCalledTimes(1);
        });

        it('calls resume() even when the context is already running (iOS requires it in the gesture)', () => {
            mockContext.state = 'running';
            const { result } = renderHook(() => useWinnerSound());

            act(() => { result.current.unlock(); });

            expect(mockContext.resume).toHaveBeenCalledTimes(1);
        });

        it('plays a silent Audio element to claim the iOS playback audio session', () => {
            const { result } = renderHook(() => useWinnerSound());

            act(() => { result.current.unlock(); });

            expect(window.Audio).toHaveBeenCalledTimes(1);
            expect(lastAudioInstance.volume).toBe(0);
            expect(mockAudioPlay).toHaveBeenCalledTimes(1);
        });

        it('reuses the same silent Audio element across multiple unlock() calls', () => {
            const { result } = renderHook(() => useWinnerSound());

            act(() => { result.current.unlock(); });
            act(() => { result.current.unlock(); });

            expect(window.Audio).toHaveBeenCalledTimes(1);
            expect(mockAudioPlay).toHaveBeenCalledTimes(2);
        });

        it('stores the resume() Promise so play() can chain on it without a second resume() call', async () => {
            mockContext.state = 'suspended';
            const { result } = renderHook(() => useWinnerSound());

            // Simulate the full iOS flow: unlock() in the gesture, play() after the async round-trip.
            act(() => { result.current.unlock(); });

            await act(async () => { result.current.play(); });

            // resume() must have been called exactly once (in unlock()), not again in play().
            expect(mockContext.resume).toHaveBeenCalledTimes(1);
            expect(mockContext.createOscillator).toHaveBeenCalledTimes(5);
        });

        it('does not throw when AudioContext is unavailable', () => {
            vi.unstubAllGlobals();
            vi.stubGlobal('Audio', vi.fn(function () {
                this.play = vi.fn(() => Promise.resolve());
                this.volume = 1;
            }));
            const { result } = renderHook(() => useWinnerSound());

            expect(() => act(() => { result.current.unlock(); })).not.toThrow();
        });
    });

    describe('play() when context is suspended (iOS path)', () => {
        it('calls resume() and schedules notes after the promise resolves', async () => {
            mockContext.state = 'suspended';
            mockContext.resume = vi.fn(() => Promise.resolve());
            const { result } = renderHook(() => useWinnerSound());

            await act(async () => { result.current.play(); });

            expect(mockContext.resume).toHaveBeenCalledTimes(1);
            expect(mockContext.createOscillator).toHaveBeenCalledTimes(5);
        });

        it('does not schedule notes when resume() rejects', async () => {
            mockContext.state = 'suspended';
            mockContext.resume = vi.fn(() => Promise.reject(new Error('blocked')));
            const { result } = renderHook(() => useWinnerSound());

            await expect(act(async () => { result.current.play(); })).resolves.not.toThrow();
            expect(mockContext.createOscillator).not.toHaveBeenCalled();
        });
    });

    it('falls back to webkitAudioContext when AudioContext is absent', () => {
        vi.unstubAllGlobals();
        vi.stubGlobal('webkitAudioContext', vi.fn(function () {
            Object.assign(this, mockContext);
        }));

        const { result } = renderHook(() => useWinnerSound());
        act(() => { result.current.play(); });

        expect(window.webkitAudioContext).toHaveBeenCalledTimes(1);
        expect(mockContext.createOscillator).toHaveBeenCalledTimes(5);
    });

    it('does not throw when neither AudioContext nor webkitAudioContext is available', () => {
        vi.unstubAllGlobals();

        const { result } = renderHook(() => useWinnerSound());

        expect(() => act(() => { result.current.play(); })).not.toThrow();
    });

    it('does not throw when AudioContext constructor throws', () => {
        vi.stubGlobal('AudioContext', vi.fn(function () { throw new Error('Not allowed'); }));

        const { result } = renderHook(() => useWinnerSound());

        expect(() => act(() => { result.current.play(); })).not.toThrow();
    });

    describe('fanfare rotation', () => {
        it('plays fanfares A → B → C → D → A in sequence', () => {
            const { result } = renderHook(() => useWinnerSound());

            // Expected first-note frequencies for each fanfare (A=C4, B=E4, C=G4, D=C5)
            const expected = [261.63, 329.63, 392.00, 523.25, 261.63];
            const firstNoteFreqs = [];

            for (let i = 0; i < 5; i++) {
                mockOscillator.frequency.setValueAtTime.mockClear();
                act(() => { result.current.play(); });
                firstNoteFreqs.push(mockOscillator.frequency.setValueAtTime.mock.calls[0][0]);
            }

            firstNoteFreqs.forEach((freq, i) => {
                expect(freq).toBeCloseTo(expected[i], 1);
            });
        });

        it('each hook instance maintains its own independent rotation index', () => {
            const { result: result1 } = renderHook(() => useWinnerSound());
            const { result: result2 } = renderHook(() => useWinnerSound());

            // Advance result1 to fanfare B
            act(() => { result1.current.play(); });

            // result2 should still start at fanfare A regardless
            mockOscillator.frequency.setValueAtTime.mockClear();
            act(() => { result2.current.play(); });

            // First note frequency should be fanfare A's C4 (261.63)
            expect(mockOscillator.frequency.setValueAtTime.mock.calls[0][0]).toBeCloseTo(261.63, 1);
        });

        it('schedules five notes for every fanfare', () => {
            const { result } = renderHook(() => useWinnerSound());

            for (let i = 0; i < 4; i++) {
                const before = mockContext.createOscillator.mock.calls.length;
                act(() => { result.current.play(); });
                const after = mockContext.createOscillator.mock.calls.length;
                expect(after - before).toBe(5);
            }
        });
    });
});
