import { useCallback, useEffect, useRef, useState } from 'react';
import { parseVoiceCommand } from '@/utils/voiceCommandParser';

/**
 * A React hook that wraps the Web Speech API's SpeechRecognition interface to
 * provide tap-to-speak voice-command input for score entry.
 *
 * Configured with `continuous: false` and `interimResults: false` for maximum
 * mobile compatibility (iOS Safari requires a user-gesture start and does not
 * support continuous or interim modes reliably).
 *
 * @param {Object}   options
 * @param {Array}    options.elements   - BaseElement catalogue (from /api/v1/base-elements).
 *   Each object must have `{ id, label, input_type }`.
 * @param {Array}    options.teams      - Teams in the current game.
 *   Each object must have `{ id, name }`.
 * @param {Function} options.onCommand  - Called with the parsed command object when a
 *   final transcript resolves to a known command.
 *   Receives `{ type: 'element'|'save', action?, elementId?, teamId?, quantity? }`.
 * @param {Function} options.onFeedback - Called with `{ ok: boolean, message: string, transcript?: string, misheardCandidates?: string[] }`
 *   for every recognition result (success or failure), so the UI can show a toast.
 *   `misheardCandidates` is a sorted array of unique, lowercased words drawn from all
 *   speech alternatives returned by the browser for the last recognition result. It is
 *   populated only when `onresult` fires (not on error or silent-stop).
 * @param {Array}    [options.aliases=[]] - The authenticated user's voice aliases.
 *   Each object must have `{ alias: string, keyword: string }`. Applied as a
 *   pre-processing step in the parser before fuzzy matching.
 * @return {{ isSupported: boolean, isListening: boolean, isReady: boolean, isSpeaking: boolean, toggle: () => void }}
 *
 * Logic:
 *   - Creates a single SpeechRecognition instance lazily on first `toggle()` call.
 *   - `toggle()` starts recognition when idle and aborts it when active.
 *   - `onresult` fires after the browser finalises speech; `parseVoiceCommand` maps
 *     the transcript to a structured command using fuzzy element/team matching.
 *   - `onerror` surfaces 'not-allowed' (permission denied) and 'no-speech' to the UI.
 *   - `onend` resets the listening flag and stops audio monitoring.
 *   - All mutable callbacks (`onCommand`, `onFeedback`, `elements`, `teams`) are kept
 *     in always-current refs so stale closures in recognition event handlers are avoided.
 *   - When listening starts, a separate `getUserMedia` + `AnalyserNode` pipeline polls
 *     the raw PCM volume on every animation frame; `isSpeaking` is true when the RMS
 *     amplitude exceeds 0.02 (silence threshold). The stream is closed when listening stops.
 *   - The recognition instance is aborted on component unmount.
 */
export default function useVoiceCommands({ elements, teams, onCommand, onFeedback, aliases = [] }) {
    const isSupported =
        typeof window !== 'undefined' &&
        !!(window.SpeechRecognition || window.webkitSpeechRecognition);

    const [isListening, setIsListening] = useState(false);
    const [isReady, setIsReady] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const recognitionRef = useRef(null);

    // Always-current refs so recognition callbacks never capture stale closures.
    const elementsRef = useRef(elements);
    const teamsRef = useRef(teams);
    const onCommandRef = useRef(onCommand);
    const onFeedbackRef = useRef(onFeedback);
    const aliasesRef = useRef(aliases);

    /**
     * Tracks whether onFeedback has already been called for the current recognition
     * session. Reset to false at the start of each new session (in toggle). Set to
     * true in onresult, onerror, and when the user deliberately aborts, so that
     * onend never fires a spurious fallback message for those cases.
     */
    const sessionFeedbackGivenRef = useRef(false);

    useEffect(() => { elementsRef.current = elements; }, [elements]);
    useEffect(() => { teamsRef.current = teams; }, [teams]);
    useEffect(() => { onCommandRef.current = onCommand; }, [onCommand]);
    useEffect(() => { onFeedbackRef.current = onFeedback; }, [onFeedback]);
    useEffect(() => { aliasesRef.current = aliases; }, [aliases]);

    // ── Audio monitor refs ────────────────────────────────────────────────────
    const streamRef = useRef(null);
    const audioCtxRef = useRef(null);
    const rafRef = useRef(null);
    /** Tracks the last value written to state to avoid redundant renders. */
    const isSpeakingRef = useRef(false);
    /** Set to false by stopAudioMonitor so startAudioMonitor can detect a cancel race. */
    const monitorActiveRef = useRef(false);

    /**
     * Stops the audio-monitor poll loop and releases all acquired resources.
     *
     * @return {void}
     *
     * Logic: Cancels the animation-frame loop, stops all media stream tracks, closes
     * the AudioContext, and resets isSpeaking. Guards each step with null checks so
     * it is safe to call when monitoring was never started or already stopped.
     */
    const stopAudioMonitor = useCallback(() => {
        monitorActiveRef.current = false;
        if (rafRef.current != null) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        audioCtxRef.current?.close().catch(() => {});
        audioCtxRef.current = null;
        if (isSpeakingRef.current) {
            isSpeakingRef.current = false;
            setIsSpeaking(false);
        }
    }, []);

    // Stable ref so getOrCreate's onend handler can always call the latest version.
    const stopAudioMonitorRef = useRef(stopAudioMonitor);
    useEffect(() => { stopAudioMonitorRef.current = stopAudioMonitor; }, [stopAudioMonitor]);

    /**
     * Starts audio monitoring by acquiring a microphone stream and polling RMS amplitude.
     *
     * @return {Promise<void>}
     *
     * Logic: Requests an audio-only stream via getUserMedia. On each animation frame,
     * reads raw PCM byte data (0–255, centred at 128) from an AnalyserNode and computes
     * the RMS value. When RMS > 0.02 the signal is considered "speaking" and isSpeaking
     * is set to true; the state is only updated on transitions to avoid redundant renders.
     * If stopAudioMonitor() is called before the getUserMedia Promise resolves (rapid
     * toggle), the acquired stream is immediately released. Falls back silently when
     * getUserMedia or AudioContext is unavailable.
     */
    const startAudioMonitor = useCallback(async () => {
        if (!navigator?.mediaDevices?.getUserMedia) return;
        monitorActiveRef.current = true;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            // Guard against the user stopping listening before the promise resolved.
            if (!monitorActiveRef.current) {
                stream.getTracks().forEach((t) => t.stop());
                return;
            }
            streamRef.current = stream;
            /* global AudioContext, webkitAudioContext */
            const AudioCtor = window.AudioContext ?? window.webkitAudioContext;
            if (!AudioCtor) {
                stream.getTracks().forEach((t) => t.stop());
                return;
            }
            const ctx = new AudioCtor();
            audioCtxRef.current = ctx;
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.3;
            ctx.createMediaStreamSource(stream).connect(analyser);
            const data = new Uint8Array(analyser.frequencyBinCount);
            const poll = () => {
                analyser.getByteTimeDomainData(data);
                let sum = 0;
                for (let i = 0; i < data.length; i++) {
                    const v = (data[i] - 128) / 128;
                    sum += v * v;
                }
                const speaking = Math.sqrt(sum / data.length) > 0.02;
                if (speaking !== isSpeakingRef.current) {
                    isSpeakingRef.current = speaking;
                    setIsSpeaking(speaking);
                }
                rafRef.current = requestAnimationFrame(poll);
            };
            rafRef.current = requestAnimationFrame(poll);
        } catch {
            // getUserMedia denied or unavailable — isSpeaking stays false.
        }
    }, []);
    // ── End audio monitor ─────────────────────────────────────────────────────

    /**
     * Lazily initialises the SpeechRecognition instance and attaches event handlers.
     *
     * @return {SpeechRecognition} The shared recognition instance.
     *
     * Logic: Creates the instance once and reuses it across calls. Handlers are
     * attached at creation time and read from always-current refs so they never
     * need to be re-attached when `elements` or `teams` change.
     * Sets `sessionFeedbackGivenRef.current = true` in every code path where
     * `onFeedback` is called so that `onend` can detect silent-stop sessions.
     */
    const getOrCreate = useCallback(() => {
        if (recognitionRef.current) return recognitionRef.current;

        const SpeechRecognitionImpl =
            window.SpeechRecognition || window.webkitSpeechRecognition;

        const r = new SpeechRecognitionImpl();
        r.continuous = false;
        r.interimResults = false;
        r.lang = (typeof navigator !== 'undefined' && navigator.language) || 'en-US';
        r.maxAlternatives = 5;

        r.onstart = () => {
            setIsReady(true);
        };

        r.onresult = (event) => {
            sessionFeedbackGivenRef.current = true;
            const lastResult = event.results[event.results.length - 1];
            const transcript = lastResult[0].transcript;

            // Collect unique lowercased words from all speech alternatives so the
            // alias-manager dropdown can offer every word the browser considered.
            const wordSet = new Set();
            for (let i = 0; i < lastResult.length; i++) {
                lastResult[i].transcript
                    .toLowerCase()
                    .replace(/[^a-z0-9\s'-]/g, '')
                    .split(/\s+/)
                    .filter(Boolean)
                    .forEach((w) => wordSet.add(w));
            }
            const misheardCandidates = [...wordSet].sort();

            const command = parseVoiceCommand(
                transcript,
                elementsRef.current,
                teamsRef.current,
                aliasesRef.current,
            );

            if (command.type === 'save') {
                onCommandRef.current(command);
                onFeedbackRef.current({ ok: true, message: 'Saving round…', transcript, misheardCandidates });
            } else if (command.type === 'element') {
                onCommandRef.current(command);
                onFeedbackRef.current({ ok: true, message: `✓ ${transcript}`, transcript, misheardCandidates });
            } else {
                onFeedbackRef.current({ ok: false, message: command.reason, transcript, misheardCandidates });
            }
        };

        r.onerror = (event) => {
            sessionFeedbackGivenRef.current = true;
            if (event.error === 'not-allowed') {
                onFeedbackRef.current({
                    ok: false,
                    message: 'Microphone access denied — enable it in your browser settings.',
                });
            } else if (event.error === 'no-speech') {
                onFeedbackRef.current({ ok: false, message: 'No speech detected — try again.' });
            } else {
                onFeedbackRef.current({ ok: false, message: 'Voice recognition error — try again.' });
            }
        };

        r.onend = () => {
            if (!sessionFeedbackGivenRef.current) {
                onFeedbackRef.current({ ok: false, message: "Couldn't start listening — try again." });
            }
            setIsListening(false);
            setIsReady(false);
            stopAudioMonitorRef.current();
        };

        recognitionRef.current = r;
        return r;
    }, []);

    /**
     * Toggles voice recognition on and off.
     * Starting recognition on a device that does not support the API is a no-op.
     *
     * @return {void}
     *
     * Logic: If currently listening, marks `sessionFeedbackGivenRef` as true
     * (preventing a spurious silent-stop message from `onend`), then aborts and
     * updates state. Otherwise resets `sessionFeedbackGivenRef` to false for the
     * new session, then creates/reuses the recognition instance and calls start().
     * The try/catch swallows InvalidStateError thrown when start() is called on an
     * already-running instance.
     */
    const toggle = useCallback(() => {
        if (!isSupported) return;

        if (isListening) {
            // Mark as handled so onend does not fire a spurious fallback message.
            sessionFeedbackGivenRef.current = true;
            recognitionRef.current?.abort();
            setIsListening(false);
            setIsReady(false);
            stopAudioMonitor();
        } else {
            const r = getOrCreate();
            try {
                sessionFeedbackGivenRef.current = false;
                r.start();
                setIsListening(true);
                startAudioMonitor();
            } catch {
                // Already started — ignore InvalidStateError.
            }
        }
    }, [isSupported, isListening, getOrCreate, stopAudioMonitor, startAudioMonitor]);

    // Abort recognition and stop audio monitoring on unmount.
    useEffect(() => {
        return () => {
            recognitionRef.current?.abort();
            stopAudioMonitor();
        };
    }, [stopAudioMonitor]);

    return { isSupported, isListening, isReady, isSpeaking, toggle };
}
