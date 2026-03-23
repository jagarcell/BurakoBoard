import { useEffect } from 'react';

/**
 * NotificationBell
 *
 * Displays a bell icon when the user has pending game invitations. Subscribes
 * to the user's private Reverb channel on mount and fires `onNewInvitation`
 * when a `game.invitation.sent` event arrives. The parent component is
 * responsible for controlling `hasPending` so it can also clear the bell when
 * the user accepts an invitation and no further pending invitations remain.
 *
 * @param {object}   props
 * @param {number}   props.userId            Authenticated user's ID (used for channel name).
 * @param {boolean}  props.hasPending        Whether to show the bell; controlled by the parent.
 * @param {Function} props.onNewInvitation   Called when a new invitation event is received.
 */
export default function NotificationBell({ userId, hasPending, onNewInvitation }) {
    useEffect(() => {
        if (!userId || !window.Echo) return;

        const channel = window.Echo.private(`App.Models.User.${userId}`);

        channel.listen('.game.invitation.sent', () => {
            onNewInvitation?.();
        });

        return () => {
            channel.stopListening('.game.invitation.sent');
            window.Echo?.leave(`App.Models.User.${userId}`);
        };
    }, [userId, onNewInvitation]);

    if (!hasPending) return null;

    return (
        <span
            aria-label="Pending game invitations"
            className="relative inline-flex"
            title="You have pending game invitations"
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
        </span>
    );
}
