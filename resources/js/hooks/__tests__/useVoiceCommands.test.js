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
        this.onsoundstart = null;
        this.onsoundend = null;
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

    it('creates a fresh SpeechRecognition instance on each new session after onend fires', () => {
        // Regression test: the spent instance must be discarded after onend so that
        // subsequent toggle() calls start a brand new instance. Reusing a finished
        // instance causes the browser to silently ignore start(), leaving the UI
        // showing "listening" while the engine is actually idle.
        const { result } = renderHook(() =>
            useVoiceCommands({ elements, teams, onCommand: vi.fn(), onFeedback: vi.fn() }),
        );

        // First session.
        act(() => result.current.toggle());
        const firstInstance = MockRecognition.instances[0];
        expect(firstInstance.start).toHaveBeenCalledTimes(1);

        // Natural end — simulates what the browser fires after speech is processed.
        act(() => { firstInstance.onend(); });
        expect(result.current.isListening).toBe(false);

        // Second session must use a new instance, not the spent one.
        act(() => result.current.toggle());
        expect(MockRecognition.instances.length).toBe(2);
        const secondInstance = MockRecognition.instances[1];
        expect(secondInstance.start).toHaveBeenCalledTimes(1);
        expect(firstInstance.start).toHaveBeenCalledTimes(1); // not called again
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

    it('includes misheardCandidates in onFeedback with unique lowercased words from all alternatives', () => {
        const onFeedback = vi.fn();

        const { result } = renderHook(() =>
            useVoiceCommands({ elements, teams, onCommand: vi.fn(), onFeedback }),
        );

        act(() => result.current.toggle());

        act(() => {
            MockRecognition.instances[0].onresult({
                results: [[
                    { transcript: 'add burako to the cracks' },
                    { transcript: 'add morocco to the cracks' },
                ]],
            });
        });

        const feedback = onFeedback.mock.calls[0][0];
        expect(feedback.misheardCandidates).toEqual(
            expect.arrayContaining(['add', 'burako', 'cracks', 'morocco', 'the', 'to']),
        );
        // Each word appears only once even though some words are shared across alternatives.
        const uniqueCheck = new Set(feedback.misheardCandidates);
        expect(uniqueCheck.size).toBe(feedback.misheardCandidates.length);
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

    describe('isSpeaking', () => {
        it('starts as false', () => {
            const { result } = renderHook(() =>
                useVoiceCommands({ elements, teams, onCommand: vi.fn(), onFeedback: vi.fn() }),
            );

            expect(result.current.isSpeaking).toBe(false);
        });

        it('becomes true when onsoundstart fires', () => {
            const { result } = renderHook(() =>
                useVoiceCommands({ elements, teams, onCommand: vi.fn(), onFeedback: vi.fn() }),
            );

            act(() => result.current.toggle());
            act(() => { MockRecognition.instances[0].onsoundstart(); });

            expect(result.current.isSpeaking).toBe(true);
        });

        it('resets to false when onsoundend fires', () => {
            const { result } = renderHook(() =>
                useVoiceCommands({ elements, teams, onCommand: vi.fn(), onFeedback: vi.fn() }),
            );

            act(() => result.current.toggle());
            act(() => { MockRecognition.instances[0].onsoundstart(); });
            act(() => { MockRecognition.instances[0].onsoundend(); });

            expect(result.current.isSpeaking).toBe(false);
        });

        it('resets to false when recognition ends naturally via onend', () => {
            const { result } = renderHook(() =>
                useVoiceCommands({ elements, teams, onCommand: vi.fn(), onFeedback: vi.fn() }),
            );

            act(() => result.current.toggle());
            act(() => { MockRecognition.instances[0].onsoundstart(); });
            act(() => { MockRecognition.instances[0].onend(); });

            expect(result.current.isSpeaking).toBe(false);
        });

        it('resets to false when the user manually toggles off while speaking', () => {
            const { result } = renderHook(() =>
                useVoiceCommands({ elements, teams, onCommand: vi.fn(), onFeedback: vi.fn() }),
            );

            act(() => result.current.toggle()); // start
            act(() => { MockRecognition.instances[0].onsoundstart(); });
            act(() => result.current.toggle()); // user stops

            expect(result.current.isSpeaking).toBe(false);
        });

        describe('iOS Safari fallback (onsoundstart never fires)', () => {
            it('becomes true after 300 ms if onsoundstart never fires', () => {
                vi.useFakeTimers();

                const { result } = renderHook(() =>
                    useVoiceCommands({ elements, teams, onCommand: vi.fn(), onFeedback: vi.fn() }),
                );

                act(() => result.current.toggle());
                act(() => { MockRecognition.instances[0].onstart(); });

                // Before the fallback timer fires isSpeaking is still false.
                expect(result.current.isSpeaking).toBe(false);

                act(() => { vi.advanceTimersByTime(300); });

                expect(result.current.isSpeaking).toBe(true);

                vi.useRealTimers();
            });

            it('cancels the fallback timer when onsoundstart fires first', () => {
                vi.useFakeTimers();

                const { result } = renderHook(() =>
                    useVoiceCommands({ elements, teams, onCommand: vi.fn(), onFeedback: vi.fn() }),
                );

                act(() => result.current.toggle());
                act(() => { MockRecognition.instances[0].onstart(); });
                // Real sound event before the 300 ms window.
                act(() => { MockRecognition.instances[0].onsoundstart(); });

                expect(result.current.isSpeaking).toBe(true);

                // Advancing past the timer should not cause any additional state change.
                act(() => { vi.advanceTimersByTime(300); });

                expect(result.current.isSpeaking).toBe(true);

                vi.useRealTimers();
            });

            it('cancels the fallback timer when onend fires before 300 ms', () => {
                vi.useFakeTimers();

                const { result } = renderHook(() =>
                    useVoiceCommands({ elements, teams, onCommand: vi.fn(), onFeedback: vi.fn() }),
                );

                act(() => result.current.toggle());
                act(() => { MockRecognition.instances[0].onstart(); });
                act(() => { MockRecognition.instances[0].onend(); });

                // Timer fires after recognition is already over — isSpeaking must stay false.
                act(() => { vi.advanceTimersByTime(300); });

                expect(result.current.isSpeaking).toBe(false);

                vi.useRealTimers();
            });

            it('cancels the fallback timer when the user manually stops before 300 ms', () => {
                vi.useFakeTimers();

                const { result } = renderHook(() =>
                    useVoiceCommands({ elements, teams, onCommand: vi.fn(), onFeedback: vi.fn() }),
                );

                act(() => result.current.toggle()); // start
                act(() => { MockRecognition.instances[0].onstart(); });
                act(() => result.current.toggle()); // user stops before timer

                act(() => { vi.advanceTimersByTime(300); });

                expect(result.current.isSpeaking).toBe(false);

                vi.useRealTimers();
            });
        });
    });

    describe('alias substitution in feedback', () => {
        it('shows the intended word instead of the misheard word in the transcript of a success feedback', () => {
            const onFeedback = vi.fn();
            const aliases = [{ alias: 'morocco', keyword: 'burako' }];

            const { result } = renderHook(() =>
                useVoiceCommands({ elements, teams, onCommand: vi.fn(), onFeedback, aliases }),
            );

            act(() => result.current.toggle());

            act(() => {
                MockRecognition.instances[0].onresult({
                    results: [[{ transcript: 'add morocco to the cracks' }]],
                });
            });

            const feedback = onFeedback.mock.calls[0][0];
            expect(feedback.ok).toBe(true);
            expect(feedback.transcript).toContain('burako');
            expect(feedback.transcript).not.toContain('morocco');
            expect(feedback.message).toContain('burako');
            expect(feedback.message).not.toContain('morocco');
        });

        it('leaves the transcript unchanged when no aliases match', () => {
            const onFeedback = vi.fn();
            const aliases = [{ alias: 'rio', keyword: 'burako' }];

            const { result } = renderHook(() =>
                useVoiceCommands({ elements, teams, onCommand: vi.fn(), onFeedback, aliases }),
            );

            act(() => result.current.toggle());

            act(() => {
                MockRecognition.instances[0].onresult({
                    results: [[{ transcript: 'add burako to the cracks' }]],
                });
            });

            const feedback = onFeedback.mock.calls[0][0];
            expect(feedback.ok).toBe(true);
            expect(feedback.transcript).toContain('burako');
        });

        it('shows the substituted word in the transcript even when the overall command fails', () => {
            // When the command is structurally unrecognised (type: unknown), the
            // feedback transcript should still reflect the alias substitution so
            // the user sees "burako" (not "Morocco") in the failure toast.
            const onFeedback = vi.fn();
            const aliases = [{ alias: 'morocco', keyword: 'burako' }];

            const { result } = renderHook(() =>
                useVoiceCommands({ elements, teams, onCommand: vi.fn(), onFeedback, aliases }),
            );

            act(() => result.current.toggle());

            // "Morocco" alone has no command structure — parseVoiceCommand returns unknown.
            act(() => {
                MockRecognition.instances[0].onresult({
                    results: [[{ transcript: 'Morocco' }]],
                });
            });

            const feedback = onFeedback.mock.calls[0][0];
            expect(feedback.ok).toBe(false);
            // Transcript should show the substituted word, not the raw misheard word.
            expect(feedback.transcript).toContain('burako');
            expect(feedback.transcript).not.toContain('Morocco');
        });

        it('matches aliases case-insensitively so a capitalised transcript word is still substituted', () => {
            // The alias is stored as lowercase "morocco" (server-normalised).
            // Speech recognition may return "Morocco" with a capital M.
            // The substitution must fire regardless of casing.
            const onFeedback = vi.fn();
            const aliases = [{ alias: 'morocco', keyword: 'burako' }];

            const { result } = renderHook(() =>
                useVoiceCommands({ elements, teams, onCommand: vi.fn(), onFeedback, aliases }),
            );

            act(() => result.current.toggle());

            act(() => {
                MockRecognition.instances[0].onresult({
                    results: [[{ transcript: 'add Morocco to the cracks' }]],
                });
            });

            const feedback = onFeedback.mock.calls[0][0];
            expect(feedback.ok).toBe(true);
            expect(feedback.transcript).toContain('burako');
            expect(feedback.transcript).not.toContain('Morocco');
        });
    });
});
