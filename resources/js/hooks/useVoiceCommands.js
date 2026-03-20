import { useCallback, useEffect, useRef, useState } from 'react';
import { parseVoiceCommand, applyAliases } from '@/utils/voiceCommandParser';

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
 *   - `onresult` fires after the browser finalises speech; alias substitution is
 *     applied first (case-insensitive), then `parseVoiceCommand` maps the result
 *     to a structured command using fuzzy element/team matching. The alias-substituted
 *     transcript is surfaced in `onFeedback` for all outcomes (success and failure)
 *     so the user always sees what the system acted on, not the raw misheard word.
 *   - `onerror` surfaces 'not-allowed' (permission denied) and 'no-speech' to the UI.
 *   - `onend` resets the listening flag and clears isSpeaking.
 *   - All mutable callbacks (`onCommand`, `onFeedback`, `elements`, `teams`) are kept
 *     in always-current refs so stale closures in recognition event handlers are avoided.
 *   - `isSpeaking` is driven by the SpeechRecognition `onsoundstart`/`onsoundend` events
 *     rather than a separate `getUserMedia` + `AnalyserNode` pipeline. This avoids
 *     acquiring a second microphone stream which on Chrome mobile and iOS Safari can
 *     interfere with the recognition engine and cause it to stop capturing audio silently.
 *   - iOS Safari does not fire `onsoundstart`/`onsoundend`. A 300 ms fallback timer is
 *     started in `onstart`; if `onsoundstart` fires first the timer is cancelled, otherwise
 *     the fallback sets `isSpeaking = true` so the ripple animation still appears on iOS.
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
    // Fallback timer for iOS Safari, which never fires onsoundstart/onsoundend.
    const soundFallbackTimerRef = useRef(null);

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
     * `onsoundstart`/`onsoundend` drive the `isSpeaking` indicator without requiring
     * a separate getUserMedia stream, which prevents microphone-access conflicts on
     * Chrome mobile and iOS Safari.
     * A 300 ms fallback timer started in `onstart` sets `isSpeaking = true` when
     * `onsoundstart` never fires (iOS Safari).
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
            // iOS Safari never fires onsoundstart; after 300 ms without it,
            // activate the speaking indicator so the ripple animation shows.
            soundFallbackTimerRef.current = setTimeout(() => {
                setIsSpeaking(true);
            }, 300);
        };

        r.onsoundstart = () => {
            // Real sound event received — cancel the iOS fallback timer.
            clearTimeout(soundFallbackTimerRef.current);
            setIsSpeaking(true);
        };

        r.onsoundend = () => {
            setIsSpeaking(false);
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

            // Apply aliases before parsing and before feedback so the substituted
            // word is shown in ALL feedback paths (success and failure alike).
            const displayTranscript = applyAliases(transcript, aliasesRef.current);

            const command = parseVoiceCommand(
                transcript,
                elementsRef.current,
                teamsRef.current,
                aliasesRef.current,
            );

            if (command.type === 'save') {
                onCommandRef.current(command);
                onFeedbackRef.current({ ok: true, message: 'Saving round…', transcript: displayTranscript, misheardCandidates });
            } else if (command.type === 'element') {
                onCommandRef.current(command);
                onFeedbackRef.current({ ok: true, message: `✓ ${displayTranscript}`, transcript: displayTranscript, misheardCandidates });
            } else {
                onFeedbackRef.current({ ok: false, message: command.reason, transcript: displayTranscript, misheardCandidates });
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
            clearTimeout(soundFallbackTimerRef.current);
            if (!sessionFeedbackGivenRef.current) {
                onFeedbackRef.current({ ok: false, message: "Couldn't start listening — try again." });
            }
            // Discard the spent instance so the next toggle() always creates a fresh one.
            // Browsers (especially Chrome/Android) do not reliably allow restarting a
            // SpeechRecognition instance after onend fires, which caused the mic to appear
            // active (isListening true) while the engine was silently not listening.
            recognitionRef.current = null;
            setIsListening(false);
            setIsReady(false);
            setIsSpeaking(false);
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
            clearTimeout(soundFallbackTimerRef.current);
            recognitionRef.current?.abort();
            setIsListening(false);
            setIsReady(false);
            setIsSpeaking(false);
        } else {
            const r = getOrCreate();
            try {
                sessionFeedbackGivenRef.current = false;
                r.start();
                setIsListening(true);
            } catch {
                // Already started — ignore InvalidStateError.
            }
        }
    }, [isSupported, isListening, getOrCreate]);

    // Abort recognition on unmount.
    useEffect(() => {
        return () => {
            recognitionRef.current?.abort();
            clearTimeout(soundFallbackTimerRef.current);
        };
    }, []);

    return { isSupported, isListening, isReady, isSpeaking, toggle };
}
