import { createPortal } from 'react-dom';

/**
 * InvitationPopup
 *
 * Displays a fixed-position popup at the top of the viewport showing the most
 * recently received game invitation. The popup remains visible until the user
 * either accepts the invitation or explicitly closes it via the × button.
 * The acceptance flow delegates to the parent via `onAccept` and mirrors the
 * behaviour of the NotificationBell invitation list items exactly.
 *
 * @param {object}   props
 * @param {object|null} props.game          The pending game object to display.
 * @param {boolean}  props.isVisible        Whether the popup is shown.
 * @param {boolean}  props.isAccepting      Whether an accept request is in-flight for this game.
 * @param {Function} props.onAccept         Called with game.id when the Accept button is clicked.
 * @param {Function} props.onClose          Called when the × button is clicked.
 *
 * Logic: Renders nothing when isVisible is false or game is null. When visible,
 * renders a portal into document.body, positioning the dialog fixed near the top
 * of the screen. The close button dismisses only; the Accept button triggers
 * onAccept(game.id) and relies on the parent to remove the game from pendingGames,
 * which in turn causes the parent to call onClose automatically.
 */
export default function InvitationPopup({ game, isVisible, isAccepting = false, onAccept, onClose }) {
    if (!isVisible || !game) return null;

    return createPortal(
        <div
            aria-label="New game invitation"
            aria-live="polite"
            className="fixed left-1/2 z-[60] w-[calc(100vw-2rem)] max-w-sm -translate-x-1/2"
            role="dialog"
            style={{ top: '16px' }}
        >
            <div className="overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-2xl ring-1 ring-amber-100">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-amber-100 bg-amber-50 px-4 py-3">
                    <div className="flex items-center gap-2">
                        <svg
                            aria-hidden="true"
                            className="h-4 w-4 text-amber-500"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.75"
                            viewBox="0 0 24 24"
                        >
                            <path
                                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </svg>
                        <p className="text-sm font-semibold text-amber-800">
                            New Game Invitation
                        </p>
                    </div>

                    <button
                        aria-label="Close invitation popup"
                        className="rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-slate-300"
                        onClick={onClose}
                        type="button"
                    >
                        <svg
                            aria-hidden="true"
                            className="h-4 w-4"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            viewBox="0 0 24 24"
                        >
                            <path
                                d="M6 18L18 6M6 6l12 12"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </svg>
                    </button>
                </div>

                {/* Invitation row — identical style to NotificationBell list items */}
                <div className="flex items-center gap-3 px-4 py-3">
                    <button
                        aria-label={`Accept invitation to ${game.name}`}
                        className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100 focus:outline-none focus:ring-2 focus:ring-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={isAccepting}
                        onClick={() => onAccept?.(game.id)}
                        type="button"
                    >
                        {isAccepting ? (
                            <svg
                                aria-hidden="true"
                                className="h-3 w-3 animate-spin"
                                fill="none"
                                viewBox="0 0 24 24"
                            >
                                <circle
                                    className="opacity-25"
                                    cx="12"
                                    cy="12"
                                    r="10"
                                    stroke="currentColor"
                                    strokeWidth="4"
                                />
                                <path
                                    className="opacity-75"
                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                                    fill="currentColor"
                                />
                            </svg>
                        ) : (
                            <svg
                                aria-hidden="true"
                                className="h-3 w-3"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    d="M5 13l4 4L19 7"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />
                            </svg>
                        )}
                        {isAccepting ? 'Accepting\u2026' : 'Accept'}
                    </button>

                    <span className="min-w-0 truncate text-sm text-slate-800">
                        {game.name}
                    </span>
                </div>
            </div>
        </div>,
        document.body,
    );
}
