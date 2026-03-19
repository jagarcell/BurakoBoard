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
 *   has fired `onstart` and is actively listening. When `isListening` is true the
 *   button is light green regardless of whether `isReady` is true or false.
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
 * on Firefox mobile or other unsupported environments. Whenever `isListening` is
 * true (whether the engine is still warming up or fully active) the button is
 * coloured light green (`bg-green-100 text-green-600`) and stays that colour
 * until listening ends.
 * When `isSpeaking` is true,
 * three concentric rings (animate-ripple, staggered delays, blue colour) expand
 * outward from behind the button and fade to transparent, mimicking the vibration
 * of a real microphone detecting sound. The button also pulses red while
 * `isListening` to indicate active recording.
 * The minimum touch target is 44×44 px (h-11 w-11) to comply with iOS HIG and
 * Android Material accessibility guidelines.
 */

/** Animation delays (ms) for each ring — staggered to create a continuous ripple. */
const RING_DELAYS = ['0ms', '467ms', '933ms'];

export default function VoiceMicButton({ isListening, isSupported, isReady = false, isSpeaking = false, onToggle, feedback }) {
    if (!isSupported) return null;

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
