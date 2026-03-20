/**
 * A microphone toggle button that surfaces voice-command state to the user.
 *
 * Renders nothing when the Web Speech API is not available in the current
 * browser, so unsupported platforms get a clean no-op degradation.
 *
 * @param {Object}        props
 * @param {boolean}       props.isListening  - Whether the mic is currently active.
 * @param {boolean}       props.isSupported  - Whether SpeechRecognition is available.
 * @param {boolean}       [props.isReady=false] - Whether the browser's SpeechRecognition
 *   has fired `onstart` and is actively accepting audio. When `isListening` is true but
 *   `isReady` is false the engine is still warming up. Once `isReady` is true the button
 *   is fully active.
 * @param {boolean}       [props.isSpeaking=false] - Whether the mic is detecting sound
 *   above the silence threshold (driven by the AnalyserNode in useVoiceCommands). When
 *   true, three expanding rings animate outward from behind the button.
 * @param {Function}      props.onToggle     - Called when the button is tapped.
 * @param {{ ok: boolean, message: string, transcript?: string } | null} props.feedback - Optional
 *   feedback toast to display inline next to the button. When `transcript` is
 *   present it is shown before the status: e.g., "add two canastras - Done!".
 *   `ok: true` renders "Done!" in green; `ok: false` renders "Failed!" in red.
 *   The original message is preserved in the `title` attribute for accessibility
 *   tooltips. Pass null to hide.
 * @return {JSX.Element | null}
 *
 * Logic: Returns null when `isSupported` is false so the button never appears
 * on Firefox mobile or other unsupported environments.
 *
 * The button progresses through three visual states while listening:
 *   1. Warming up (`isListening && !isReady`): button is light green and a spinning
 *      green ring overlays the button to signal the engine is initialising.
 *   2. Ready to speak (`isListening && isReady && !isSpeaking && !feedback`): the
 *      spinner disappears and a pulsing "Speak now..." hint appears next to the button
 *      so the user knows they can start talking.
 *   3. Speaking (`isListening && isSpeaking`): three concentric blue rings (animate-ripple,
 *      staggered delays) expand from behind the button, replacing the hint.
 *
 * The minimum touch target is 44×44 px (h-11 w-11) to comply with iOS HIG and
 * Android Material accessibility guidelines.
 */

/** Animation delays (ms) for each ring — staggered to create a continuous ripple. */
const RING_DELAYS = ['0ms', '467ms', '933ms'];

export default function VoiceMicButton({ isListening, isSupported, isReady = false, isSpeaking = false, onToggle, feedback }) {
    if (!isSupported) return null;

    const isWarmingUp = isListening && !isReady;
    const showReadyHint = isListening && isReady && !isSpeaking && !feedback;

    return (
        <div className="flex items-center gap-2">
            {feedback && (
                <span
                    aria-live="polite"
                    className={`text-xs font-medium ${
                        feedback.ok ? 'text-green-600' : 'text-red-500'
                    }`}
                    title={feedback.message}
                >
                    {feedback.transcript ? `${feedback.transcript} - ` : ''}{feedback.ok ? 'Done!' : 'Failed!'}
                </span>
            )}

            {showReadyHint && (
                <span
                    aria-live="polite"
                    className="text-xs font-medium text-indigo-500 animate-pulse"
                    data-testid="speak-now-hint"
                >
                    Speak now...
                </span>
            )}

            <div className="relative inline-flex">
                {isSpeaking && (
                    <span
                        aria-hidden="true"
                        className="absolute inset-0 pointer-events-none"
                        data-testid="voice-wave-indicator"
                    >
                        {RING_DELAYS.map((delay, i) => (
                            <span
                                key={i}
                                className="absolute inset-0 rounded-full border-2 border-blue-400 animate-ripple"
                                style={{ animationDelay: delay }}
                            />
                        ))}
                    </span>
                )}

                {isWarmingUp && (
                    <span
                        aria-hidden="true"
                        className="absolute inset-0 pointer-events-none"
                        data-testid="mic-warming-indicator"
                    >
                        <span className="absolute inset-0 rounded-full border-2 border-green-400 border-t-transparent animate-spin" />
                    </span>
                )}

                <button
                aria-label={isListening ? 'Stop voice command' : 'Start voice command'}
                aria-pressed={isListening}
                className={`inline-flex h-11 w-11 items-center justify-center rounded-full transition-colors ${
                    isListening
                        ? 'bg-green-100 text-green-600'
                        : 'text-slate-400 hover:bg-indigo-100 hover:text-indigo-600'
                }`}
                onClick={onToggle}
                type="button"
            >
                {/* Microphone icon */}
                <svg
                    aria-hidden="true"
                    className="h-5 w-5"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                >
                    <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.93V21h2v-3.07A7 7 0 0 0 19 11h-2z" />
                </svg>
                </button>
            </div>
        </div>
    );
}
