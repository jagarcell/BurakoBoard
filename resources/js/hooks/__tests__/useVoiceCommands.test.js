import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useVoiceCommands from '@/hooks/useVoiceCommands';

const elements = [
    { id: 1, label: 'Burako', input_type: 'boolean' },
    { id: 2, label: 'Dirty Canastra', input_type: 'quantity' },
];
const teams = [
    { id: 10, name: 'The Cracks' },
];

/**
 * Creates a minimal mock SpeechRecognition constructor whose instances expose
 * `start`, `abort`, and the event handler properties expected by the hook.
 */
function makeMockRecognition() {
    const instances = [];

    const MockRecognition = vi.fn(function () {
        this.continuous = false;
        this.interimResults = false;
        this.lang = '';
        this.start = vi.fn();
        this.abort = vi.fn();
        this.onstart = null;
        this.onresult = null;
        this.onerror = null;
        this.onend = null;
        instances.push(this);
    });

    // Expose the array so tests can grab the created instance.
    MockRecognition.instances = instances;

    return MockRecognition;
}

describe('useVoiceCommands', () => {
    let MockRecognition;

    beforeEach(() => {
        MockRecognition = makeMockRecognition();
        vi.stubGlobal('SpeechRecognition', MockRecognition);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('reports isSupported = true when SpeechRecognition is available', () => {
        const { result } = renderHook(() =>
            useVoiceCommands({ elements, teams, onCommand: vi.fn(), onFeedback: vi.fn() }),
        );

        expect(result.current.isSupported).toBe(true);
    });

    it('reports isSupported = false when SpeechRecognition is not available', () => {
        vi.unstubAllGlobals();

        const { result } = renderHook(() =>
            useVoiceCommands({ elements, teams, onCommand: vi.fn(), onFeedback: vi.fn() }),
        );

        expect(result.current.isSupported).toBe(false);
    });

    it('starts as not listening', () => {
        const { result } = renderHook(() =>
            useVoiceCommands({ elements, teams, onCommand: vi.fn(), onFeedback: vi.fn() }),
        );

        expect(result.current.isListening).toBe(false);
    });

    it('sets isListening to true when toggle is called while idle', () => {
        const { result } = renderHook(() =>
            useVoiceCommands({ elements, teams, onCommand: vi.fn(), onFeedback: vi.fn() }),
        );

        act(() => result.current.toggle());

        expect(result.current.isListening).toBe(true);
        expect(MockRecognition.instances[0].start).toHaveBeenCalledTimes(1);
    });

    it('calls abort and sets isListening to false when toggle is called while listening', () => {
        const { result } = renderHook(() =>
            useVoiceCommands({ elements, teams, onCommand: vi.fn(), onFeedback: vi.fn() }),
        );

        act(() => result.current.toggle()); // start
        act(() => result.current.toggle()); // stop

        expect(result.current.isListening).toBe(false);
        expect(MockRecognition.instances[0].abort).toHaveBeenCalledTimes(1);
    });

    it('sets isListening to false when recognition ends naturally via onend', () => {
        const { result } = renderHook(() =>
            useVoiceCommands({ elements, teams, onCommand: vi.fn(), onFeedback: vi.fn() }),
        );

        act(() => result.current.toggle());

        act(() => {
            MockRecognition.instances[0].onend();
        });

        expect(result.current.isListening).toBe(false);
    });

    it('calls onCommand with a parsed element command when a matching transcript arrives', () => {
        const onCommand = vi.fn();
        const onFeedback = vi.fn();

        const { result } = renderHook(() =>
            useVoiceCommands({ elements, teams, onCommand, onFeedback }),
        );

        act(() => result.current.toggle());

        act(() => {
            MockRecognition.instances[0].onresult({
                results: [[{ transcript: 'add dirty canastra to the cracks' }]],
            });
        });

        expect(onCommand).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'element', elementId: 2, teamId: 10 }),
        );
        expect(onFeedback).toHaveBeenCalledWith(
            expect.objectContaining({ ok: true }),
        );
    });

    it('calls onCommand with a save command for "save round"', () => {
        const onCommand = vi.fn();

        const { result } = renderHook(() =>
            useVoiceCommands({ elements, teams, onCommand, onFeedback: vi.fn() }),
        );

        act(() => result.current.toggle());

        act(() => {
            MockRecognition.instances[0].onresult({
                results: [[{ transcript: 'save round' }]],
            });
        });

        expect(onCommand).toHaveBeenCalledWith({ type: 'save' });
    });

    it('calls onFeedback with ok:false for an unrecognised transcript', () => {
        const onFeedback = vi.fn();

        const { result } = renderHook(() =>
            useVoiceCommands({ elements, teams, onCommand: vi.fn(), onFeedback }),
        );

        act(() => result.current.toggle());

        act(() => {
            MockRecognition.instances[0].onresult({
                results: [[{ transcript: 'hello there' }]],
            });
        });

        expect(onFeedback).toHaveBeenCalledWith(
            expect.objectContaining({ ok: false }),
        );
    });

    it('calls onFeedback with a microphone-denied message on not-allowed error', () => {
        const onFeedback = vi.fn();

        const { result } = renderHook(() =>
            useVoiceCommands({ elements, teams, onCommand: vi.fn(), onFeedback }),
        );

        act(() => result.current.toggle());

        act(() => {
            MockRecognition.instances[0].onerror({ error: 'not-allowed' });
        });

        expect(onFeedback).toHaveBeenCalledWith(
            expect.objectContaining({ ok: false, message: expect.stringContaining('denied') }),
        );
    });

    it('calls onFeedback with a no-speech message on no-speech error', () => {
        const onFeedback = vi.fn();

        const { result } = renderHook(() =>
            useVoiceCommands({ elements, teams, onCommand: vi.fn(), onFeedback }),
        );

        act(() => result.current.toggle());

        act(() => {
            MockRecognition.instances[0].onerror({ error: 'no-speech' });
        });

        expect(onFeedback).toHaveBeenCalledWith(
            expect.objectContaining({ ok: false, message: expect.stringContaining('speech') }),
        );
    });

    it('aborts recognition on unmount', () => {
        const { result, unmount } = renderHook(() =>
            useVoiceCommands({ elements, teams, onCommand: vi.fn(), onFeedback: vi.fn() }),
        );

        act(() => result.current.toggle());

        unmount();

        expect(MockRecognition.instances[0].abort).toHaveBeenCalled();
    });

    it('does nothing if toggle is called when isSupported is false', () => {
        vi.unstubAllGlobals();

        const { result } = renderHook(() =>
            useVoiceCommands({ elements, teams, onCommand: vi.fn(), onFeedback: vi.fn() }),
        );

        expect(() => act(() => result.current.toggle())).not.toThrow();
        expect(result.current.isListening).toBe(false);
    });

    describe('isReady', () => {
        it('starts as false', () => {
            const { result } = renderHook(() =>
                useVoiceCommands({ elements, teams, onCommand: vi.fn(), onFeedback: vi.fn() }),
            );

            expect(result.current.isReady).toBe(false);
        });

        it('becomes true when onstart fires', () => {
            const { result } = renderHook(() =>
                useVoiceCommands({ elements, teams, onCommand: vi.fn(), onFeedback: vi.fn() }),
            );

            act(() => result.current.toggle());
            act(() => { MockRecognition.instances[0].onstart(); });

            expect(result.current.isReady).toBe(true);
        });

        it('resets to false when onend fires', () => {
            const { result } = renderHook(() =>
                useVoiceCommands({ elements, teams, onCommand: vi.fn(), onFeedback: vi.fn() }),
            );

            act(() => result.current.toggle());
            act(() => { MockRecognition.instances[0].onstart(); });
            act(() => { MockRecognition.instances[0].onend(); });

            expect(result.current.isReady).toBe(false);
        });

        it('resets to false when the user manually toggles off', () => {
            const { result } = renderHook(() =>
                useVoiceCommands({ elements, teams, onCommand: vi.fn(), onFeedback: vi.fn() }),
            );

            act(() => result.current.toggle()); // start
            act(() => { MockRecognition.instances[0].onstart(); }); // browser ready
            act(() => result.current.toggle()); // user stops

            expect(result.current.isReady).toBe(false);
        });
    });

    describe('silent-stop and unhandled error feedback', () => {
        it('calls onFeedback with ok:false for an unhandled onerror type (e.g., audio-capture)', () => {
            const onFeedback = vi.fn();

            const { result } = renderHook(() =>
                useVoiceCommands({ elements, teams, onCommand: vi.fn(), onFeedback }),
            );

            act(() => result.current.toggle());

            act(() => {
                MockRecognition.instances[0].onerror({ error: 'audio-capture' });
            });

            expect(onFeedback).toHaveBeenCalledWith(
                expect.objectContaining({ ok: false }),
            );
        });

        it('calls onFeedback when recognition ends silently without a prior result or error', () => {
            const onFeedback = vi.fn();

            const { result } = renderHook(() =>
                useVoiceCommands({ elements, teams, onCommand: vi.fn(), onFeedback }),
            );

            act(() => result.current.toggle());

            act(() => {
                MockRecognition.instances[0].onend();
            });

            expect(onFeedback).toHaveBeenCalledWith(
                expect.objectContaining({ ok: false }),
            );
        });

        it('does not call onFeedback when the user manually stops listening and onend fires', () => {
            const onFeedback = vi.fn();

            const { result } = renderHook(() =>
                useVoiceCommands({ elements, teams, onCommand: vi.fn(), onFeedback }),
            );

            act(() => result.current.toggle()); // start
            act(() => result.current.toggle()); // user stops

            // Simulate recognition firing onend after abort.
            act(() => {
                MockRecognition.instances[0].onend();
            });

            expect(onFeedback).not.toHaveBeenCalled();
        });

        it('does not call onFeedback a second time when onend fires after a successful onresult', () => {
            const onFeedback = vi.fn();

            const { result } = renderHook(() =>
                useVoiceCommands({ elements, teams, onCommand: vi.fn(), onFeedback }),
            );

            act(() => result.current.toggle());

            act(() => {
                MockRecognition.instances[0].onresult({
                    results: [[{ transcript: 'save round' }]],
                });
            });

            const callCountAfterResult = onFeedback.mock.calls.length;

            act(() => {
                MockRecognition.instances[0].onend();
            });

            expect(onFeedback).toHaveBeenCalledTimes(callCountAfterResult);
        });

        it('does not call onFeedback a second time when onend fires after onerror', () => {
            const onFeedback = vi.fn();

            const { result } = renderHook(() =>
                useVoiceCommands({ elements, teams, onCommand: vi.fn(), onFeedback }),
            );

            act(() => result.current.toggle());

            act(() => {
                MockRecognition.instances[0].onerror({ error: 'no-speech' });
            });

            const callCountAfterError = onFeedback.mock.calls.length;

            act(() => {
                MockRecognition.instances[0].onend();
            });

            expect(onFeedback).toHaveBeenCalledTimes(callCountAfterError);
        });
    });

    describe('isSpeaking / audio monitor', () => {
        let mockTrack;
        let mockStream;
        let mockGetUserMedia;
        let mockAnalyser;
        let mockAudioCtx;

        beforeEach(() => {
            mockTrack = { stop: vi.fn() };
            mockStream = { getTracks: vi.fn(() => [mockTrack]) };
            mockGetUserMedia = vi.fn(() => Promise.resolve(mockStream));

            mockAnalyser = {
                fftSize: 0,
                smoothingTimeConstant: 0,
                frequencyBinCount: 4,
                // Return silent data (all 128 = zero amplitude) by default.
                getByteTimeDomainData: vi.fn((arr) => arr.fill(128)),
                connect: vi.fn(),
            };

            mockAudioCtx = {
                createAnalyser: vi.fn(() => mockAnalyser),
                createMediaStreamSource: vi.fn(() => ({ connect: vi.fn() })),
                close: vi.fn(() => Promise.resolve()),
            };

            vi.stubGlobal('AudioContext', vi.fn(function () {
                Object.assign(this, mockAudioCtx);
            }));

            // rAF returns a handle (99) but does not loop; each poll fires once.
            vi.stubGlobal('requestAnimationFrame', vi.fn(() => 99));
            vi.stubGlobal('cancelAnimationFrame', vi.fn());

            // Patch navigator.mediaDevices without replacing the whole navigator.
            Object.defineProperty(window.navigator, 'mediaDevices', {
                value: { getUserMedia: mockGetUserMedia },
                configurable: true,
                writable: true,
            });
        });

        afterEach(() => {
            // Remove the patched mediaDevices so other tests are unaffected.
            Object.defineProperty(window.navigator, 'mediaDevices', {
                value: undefined,
                configurable: true,
                writable: true,
            });
        });

        it('isSpeaking starts as false', () => {
            const { result } = renderHook(() =>
                useVoiceCommands({ elements, teams, onCommand: vi.fn(), onFeedback: vi.fn() }),
            );

            expect(result.current.isSpeaking).toBe(false);
        });

        it('calls getUserMedia when toggle starts listening', async () => {
            const { result } = renderHook(() =>
                useVoiceCommands({ elements, teams, onCommand: vi.fn(), onFeedback: vi.fn() }),
            );

            await act(async () => {
                result.current.toggle();
            });

            expect(mockGetUserMedia).toHaveBeenCalledWith({ audio: true, video: false });
        });

        it('stops stream tracks when toggle stops listening', async () => {
            const { result } = renderHook(() =>
                useVoiceCommands({ elements, teams, onCommand: vi.fn(), onFeedback: vi.fn() }),
            );

            await act(async () => { result.current.toggle(); }); // start
            act(() => { result.current.toggle(); });              // stop

            expect(mockTrack.stop).toHaveBeenCalled();
        });

        it('stops stream tracks and cancels rAF on unmount', async () => {
            const { result, unmount } = renderHook(() =>
                useVoiceCommands({ elements, teams, onCommand: vi.fn(), onFeedback: vi.fn() }),
            );

            await act(async () => { result.current.toggle(); });

            unmount();

            expect(mockTrack.stop).toHaveBeenCalled();
            expect(window.cancelAnimationFrame).toHaveBeenCalledWith(99);
        });

        it('stops stream tracks when recognition ends naturally via onend', async () => {
            const { result } = renderHook(() =>
                useVoiceCommands({ elements, teams, onCommand: vi.fn(), onFeedback: vi.fn() }),
            );

            await act(async () => { result.current.toggle(); });

            act(() => { MockRecognition.instances[0].onend(); });

            expect(mockTrack.stop).toHaveBeenCalled();
        });

        it('does not throw when getUserMedia is not available', () => {
            Object.defineProperty(window.navigator, 'mediaDevices', {
                value: undefined,
                configurable: true,
                writable: true,
            });

            const { result } = renderHook(() =>
                useVoiceCommands({ elements, teams, onCommand: vi.fn(), onFeedback: vi.fn() }),
            );

            expect(() => act(() => { result.current.toggle(); })).not.toThrow();
        });
    });
});
