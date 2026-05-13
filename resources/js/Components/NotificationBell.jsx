import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * NotificationBell
 *
 * Displays a bell icon button when the user has pending game invitations.
 * Clicking the bell opens a popup panel that lists every pending invitation with
 * an individual Accept CTA. Subscribes to the user's private Reverb channel on
 * mount and fires `onNewInvitation` when a `game.invitation.sent` event arrives.
 * The parent component is responsible for controlling `hasPending` and
 * `pendingGames` so it can also clear the bell when all invitations are accepted.
 *
 * @param {object}   props
 * @param {number}   props.userId              Authenticated user's ID (used for channel name).
 * @param {boolean}  props.hasPending          Whether to show the bell; controlled by the parent.
 * @param {Array}    props.pendingGames         List of games with user_role === 'pending_invitee'.
 * @param {Function} props.onNewInvitation      Called when a new invitation event is received.
 * @param {Function} props.onAcceptInvitation   Called with gameId when the user accepts an invite.
 * @param {Set}      props.acceptingGameIds     Set of gameIds currently being accepted (loading state).
 * @param {Function} props.onOpen               Called when the popup opens so the parent can refresh the list.
 * @param {boolean}  props.isLoadingGames       When true the popup shows a loading spinner instead of the list.
 */
export default function NotificationBell({
    userId,
    hasPending,
    pendingGames = [],
    onNewInvitation,
    onAcceptInvitation,
    acceptingGameIds = new Set(),
    onOpen,
    isLoadingGames = false,
}) {
    const [isOpen, setIsOpen] = useState(false);
    const [panelRect, setPanelRect] = useState(null);
    const bellRef = useRef(null);
    const onNewInvitationRef = useRef(onNewInvitation);

    // Keep the ref in sync with the latest prop on every render without
    // triggering the Echo subscription effect.
    useEffect(() => {
        onNewInvitationRef.current = onNewInvitation;
    });

    useEffect(() => {
        if (!userId || !window.Echo) return;

        const channel = window.Echo.private(`App.Models.User.${userId}`);

        channel.listen('.game.invitation.sent', () => {
            onNewInvitationRef.current?.();
        });

        return () => {
            // Only stop listening on this specific event — do not call
            // echo.leave() here.  GameCard subscribes to the same
            // `App.Models.User.${userId}` channel for `.game.role.updated`
            // events.  Calling leave() would destroy the shared underlying
            // Pusher channel and permanently kill GameCard's host-delegation
            // listener for the rest of the session.
            channel.stopListening('.game.invitation.sent');
        };
    }, [userId]);

    // Close popup when all invitations are cleared.
    useEffect(() => {
        if (!hasPending) {
            setIsOpen(false);
        }
    }, [hasPending]);

    if (!hasPending) return null;

    const handleBellClick = () => {
        const rect = bellRef.current?.getBoundingClientRect();
        setPanelRect(rect ?? null);
        const willOpen = !isOpen;
        setIsOpen(willOpen);
        if (willOpen) {
            onOpen?.();
        }
    };

    return (
        <>
            {isOpen && (
                <div
                    aria-hidden="true"
                    className="fixed inset-0 z-40"
                    onClick={() => setIsOpen(false)}
                />
            )}

            <button
                ref={bellRef}
                aria-label="Pending game invitations"
                className="relative inline-flex rounded-full focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-1"
                onClick={handleBellClick}
                title="You have pending game invitations"
                type="button"
            >
                <svg
                    aria-hidden="true"
                    className="h-5 w-5 text-amber-500"
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
                <span aria-hidden="true" className="absolute -right-1 -top-1 flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
                </span>
            </button>

            {isOpen && panelRect && createPortal(
                <div
                    aria-label="Game invitations"
                    className="z-50 w-auto overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
                    role="dialog"
                    style={{
                        position: 'fixed',
                        top: panelRect.bottom + 8,
                        left: panelRect.left,
                    }}
                >
                    <div className="border-b border-slate-100 px-4 py-3">
                        <p className="text-sm font-semibold text-slate-800">
                            Game Invitations
                        </p>
                    </div>

                    {isLoadingGames ? (
                        <div className="flex items-center justify-center px-4 py-6">
                            <svg
                                aria-label="Loading invitations"
                                className="h-5 w-5 animate-spin text-amber-500"
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
                        </div>
                    ) : pendingGames.length === 0 ? (
                        <p className="px-4 py-4 text-sm text-slate-500">
                            No pending invitations.
                        </p>
                    ) : (
                        <ul
                            className="max-h-64 divide-y divide-slate-100 overflow-y-auto"
                            role="list"
                        >
                            {pendingGames.map((game) => {
                                const isAccepting = acceptingGameIds.has(game.id);

                                return (
                                    <li
                                        key={game.id}
                                        className="flex items-center gap-3 px-4 py-3"
                                    >
                                        <button
                                            aria-label={`Accept invitation to ${game.name}`}
                                            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100 focus:outline-none focus:ring-2 focus:ring-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
                                            disabled={isAccepting}
                                            onClick={() => onAcceptInvitation?.(game.id)}
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
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>,
                document.body,
            )}
        </>
    );
}
