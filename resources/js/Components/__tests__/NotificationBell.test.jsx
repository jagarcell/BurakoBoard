import '@testing-library/jest-dom/vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NotificationBell from '@/Components/NotificationBell';

// ---------------------------------------------------------------------------
// Echo mock helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal window.Echo stub that captures the latest `.listen` callback
 * so tests can trigger it manually.
 *
 * @returns {{ triggerInvitation: Function }} Object exposing a helper to fire the event.
 */
function buildEchoMock() {
    let capturedCallback = null;

    const channelStub = {
        listen: vi.fn((_event, cb) => {
            capturedCallback = cb;
            return channelStub;
        }),
        stopListening: vi.fn(() => channelStub),
    };

    window.Echo = {
        private: vi.fn(() => channelStub),
        leave: vi.fn(),
    };

    return {
        triggerInvitation: () => {
            if (capturedCallback) capturedCallback({ game_id: 1, game_name: 'Test', inviter_name: 'Alice' });
        },
    };
}

const pendingGame = { id: 5, name: 'Friday Burako', target_points: 2000 };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NotificationBell', () => {
    afterEach(() => {
        delete window.Echo;
        vi.restoreAllMocks();
    });

    it('renders nothing when hasPending is false and no real-time event arrives', () => {
        buildEchoMock();
        const { container } = render(
            <NotificationBell userId={1} hasPending={false} onNewInvitation={vi.fn()} />,
        );
        expect(container.firstChild).toBeNull();
    });

    it('renders the bell button when hasPending is true', () => {
        buildEchoMock();
        render(<NotificationBell userId={1} hasPending={true} onNewInvitation={vi.fn()} />);
        expect(screen.getByRole('button', { name: 'Pending game invitations' })).toBeInTheDocument();
    });

    it('renders the bell icon as accessible with the correct title', () => {
        buildEchoMock();
        render(<NotificationBell userId={1} hasPending={true} onNewInvitation={vi.fn()} />);
        expect(screen.getByTitle('You have pending game invitations')).toBeInTheDocument();
    });

    it('subscribes to the correct private channel on mount', () => {
        const { triggerInvitation: _ } = buildEchoMock();
        render(<NotificationBell userId={7} hasPending={false} onNewInvitation={vi.fn()} />);
        expect(window.Echo.private).toHaveBeenCalledWith('App.Models.User.7');
    });

    it('listens for the .game.invitation.sent event', () => {
        buildEchoMock();
        render(<NotificationBell userId={1} hasPending={false} onNewInvitation={vi.fn()} />);
        const channel = window.Echo.private.mock.results[0].value;
        expect(channel.listen).toHaveBeenCalledWith('.game.invitation.sent', expect.any(Function));
    });

    it('calls onNewInvitation when a real-time invitation event arrives', async () => {
        const { triggerInvitation } = buildEchoMock();
        const onNewInvitation = vi.fn();
        render(<NotificationBell userId={1} hasPending={false} onNewInvitation={onNewInvitation} />);

        expect(onNewInvitation).not.toHaveBeenCalled();

        await act(async () => {
            triggerInvitation();
        });

        expect(onNewInvitation).toHaveBeenCalledTimes(1);
    });

    it('does not leave or rejoin the channel when only onNewInvitation reference changes', async () => {
        const { triggerInvitation } = buildEchoMock();
        const firstCallback = vi.fn();
        const secondCallback = vi.fn();

        const { rerender } = render(
            <NotificationBell userId={1} hasPending={false} onNewInvitation={firstCallback} />,
        );

        // Re-render with a brand-new function reference — same userId.
        rerender(<NotificationBell userId={1} hasPending={false} onNewInvitation={secondCallback} />);

        // The channel must never have been torn down (leave not called mid-lifecycle).
        expect(window.Echo.leave).not.toHaveBeenCalled();

        // Triggering the event after the re-render must invoke the latest callback.
        await act(async () => {
            triggerInvitation();
        });

        expect(secondCallback).toHaveBeenCalledTimes(1);
        expect(firstCallback).not.toHaveBeenCalled();
    });

    it('does not subscribe when userId is not provided', () => {
        buildEchoMock();
        render(<NotificationBell userId={null} hasPending={false} onNewInvitation={vi.fn()} />);
        expect(window.Echo.private).not.toHaveBeenCalled();
    });

    it('does not throw when window.Echo is absent', () => {
        delete window.Echo;
        expect(() =>
            render(<NotificationBell userId={1} hasPending={false} onNewInvitation={vi.fn()} />),
        ).not.toThrow();
    });

    it('does NOT leave the shared user channel on unmount (prevents destroying GameCard role listener)', () => {
        buildEchoMock();
        const { unmount } = render(
            <NotificationBell userId={3} hasPending={false} onNewInvitation={vi.fn()} />,
        );
        unmount();
        // echo.leave() must NOT be called — the App.Models.User channel is shared with
        // GameCard's .game.role.updated subscription; tearing it down here would silently
        // kill host-delegation events for the rest of the session.
        expect(window.Echo.leave).not.toHaveBeenCalled();
    });

    it('stops listening on unmount', () => {
        buildEchoMock();
        const { unmount } = render(
            <NotificationBell userId={3} hasPending={false} onNewInvitation={vi.fn()} />,
        );
        unmount();
        const channel = window.Echo.private.mock.results[0].value;
        expect(channel.stopListening).toHaveBeenCalledWith('.game.invitation.sent');
    });

    // -------------------------------------------------------------------------
    // Popup panel — open / close
    // -------------------------------------------------------------------------

    it('opens the invitations popup when the bell button is clicked', async () => {
        buildEchoMock();
        render(
            <NotificationBell
                userId={1}
                hasPending={true}
                pendingGames={[pendingGame]}
                onNewInvitation={vi.fn()}
                onAcceptInvitation={vi.fn()}
            />,
        );

        expect(screen.queryByRole('dialog', { name: 'Game invitations' })).not.toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', { name: 'Pending game invitations' }));

        expect(screen.getByRole('dialog', { name: 'Game invitations' })).toBeInTheDocument();
    });

    it('closes the popup when clicking the bell button again', async () => {
        buildEchoMock();
        render(
            <NotificationBell
                userId={1}
                hasPending={true}
                pendingGames={[pendingGame]}
                onNewInvitation={vi.fn()}
                onAcceptInvitation={vi.fn()}
            />,
        );

        const bell = screen.getByRole('button', { name: 'Pending game invitations' });
        await userEvent.click(bell);
        expect(screen.getByRole('dialog', { name: 'Game invitations' })).toBeInTheDocument();

        await userEvent.click(bell);
        expect(screen.queryByRole('dialog', { name: 'Game invitations' })).not.toBeInTheDocument();
    });

    it('closes the popup when clicking the overlay outside the panel', async () => {
        buildEchoMock();
        const { container } = render(
            <NotificationBell
                userId={1}
                hasPending={true}
                pendingGames={[pendingGame]}
                onNewInvitation={vi.fn()}
                onAcceptInvitation={vi.fn()}
            />,
        );

        await userEvent.click(screen.getByRole('button', { name: 'Pending game invitations' }));
        expect(screen.getByRole('dialog', { name: 'Game invitations' })).toBeInTheDocument();

        // Click the overlay (the fixed inset-0 div rendered before the bell button).
        const overlay = container.querySelector('[aria-hidden="true"].fixed.inset-0');
        await userEvent.click(overlay);

        expect(screen.queryByRole('dialog', { name: 'Game invitations' })).not.toBeInTheDocument();
    });

    // -------------------------------------------------------------------------
    // Popup panel — content
    // -------------------------------------------------------------------------

    it('lists all pending games inside the popup with their names', async () => {
        buildEchoMock();
        const games = [
            { id: 5, name: 'Friday Burako', target_points: 2000 },
            { id: 9, name: 'Sunday Rummy', target_points: 1500 },
        ];

        render(
            <NotificationBell
                userId={1}
                hasPending={true}
                pendingGames={games}
                onNewInvitation={vi.fn()}
                onAcceptInvitation={vi.fn()}
            />,
        );

        await userEvent.click(screen.getByRole('button', { name: 'Pending game invitations' }));

        expect(screen.getByText('Friday Burako')).toBeInTheDocument();
        expect(screen.getByText('Sunday Rummy')).toBeInTheDocument();
    });

    it('shows an Accept button for each pending game in the popup', async () => {
        buildEchoMock();
        const games = [
            { id: 5, name: 'Friday Burako', target_points: 2000 },
            { id: 9, name: 'Sunday Rummy', target_points: 1500 },
        ];

        render(
            <NotificationBell
                userId={1}
                hasPending={true}
                pendingGames={games}
                onNewInvitation={vi.fn()}
                onAcceptInvitation={vi.fn()}
            />,
        );

        await userEvent.click(screen.getByRole('button', { name: 'Pending game invitations' }));

        expect(
            screen.getByRole('button', { name: 'Accept invitation to Friday Burako' }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Accept invitation to Sunday Rummy' }),
        ).toBeInTheDocument();
    });

    it('shows an empty state message when pendingGames is empty', async () => {
        buildEchoMock();
        render(
            <NotificationBell
                userId={1}
                hasPending={true}
                pendingGames={[]}
                onNewInvitation={vi.fn()}
                onAcceptInvitation={vi.fn()}
            />,
        );

        await userEvent.click(screen.getByRole('button', { name: 'Pending game invitations' }));

        expect(screen.getByText('No pending invitations.')).toBeInTheDocument();
    });

    // -------------------------------------------------------------------------
    // Popup panel — accept action
    // -------------------------------------------------------------------------

    it('calls onAcceptInvitation with the correct game id when Accept is clicked', async () => {
        buildEchoMock();
        const onAcceptInvitation = vi.fn();

        render(
            <NotificationBell
                userId={1}
                hasPending={true}
                pendingGames={[pendingGame]}
                onNewInvitation={vi.fn()}
                onAcceptInvitation={onAcceptInvitation}
            />,
        );

        await userEvent.click(screen.getByRole('button', { name: 'Pending game invitations' }));
        await userEvent.click(
            screen.getByRole('button', { name: `Accept invitation to ${pendingGame.name}` }),
        );

        expect(onAcceptInvitation).toHaveBeenCalledWith(pendingGame.id);
    });

    it('disables the Accept button and shows a spinner when the game id is in acceptingGameIds', async () => {
        buildEchoMock();

        render(
            <NotificationBell
                userId={1}
                hasPending={true}
                pendingGames={[pendingGame]}
                onNewInvitation={vi.fn()}
                onAcceptInvitation={vi.fn()}
                acceptingGameIds={new Set([pendingGame.id])}
            />,
        );

        await userEvent.click(screen.getByRole('button', { name: 'Pending game invitations' }));

        const acceptBtn = screen.getByRole('button', {
            name: `Accept invitation to ${pendingGame.name}`,
        });

        expect(acceptBtn).toBeDisabled();
    });

    // -------------------------------------------------------------------------
    // Popup panel — auto-close on cleared state
    // -------------------------------------------------------------------------

    it('closes the popup when hasPending changes to false while the panel is open', async () => {
        buildEchoMock();
        const { rerender } = render(
            <NotificationBell
                userId={1}
                hasPending={true}
                pendingGames={[pendingGame]}
                onNewInvitation={vi.fn()}
                onAcceptInvitation={vi.fn()}
            />,
        );

        await userEvent.click(screen.getByRole('button', { name: 'Pending game invitations' }));
        expect(screen.getByRole('dialog', { name: 'Game invitations' })).toBeInTheDocument();

        rerender(
            <NotificationBell
                userId={1}
                hasPending={false}
                pendingGames={[]}
                onNewInvitation={vi.fn()}
                onAcceptInvitation={vi.fn()}
            />,
        );

        await waitFor(() =>
            expect(screen.queryByRole('dialog', { name: 'Game invitations' })).not.toBeInTheDocument(),
        );
    });

    // -------------------------------------------------------------------------
    // onOpen callback
    // -------------------------------------------------------------------------

    it('calls onOpen when the bell is clicked to open the popup', async () => {
        buildEchoMock();
        const onOpen = vi.fn();

        render(
            <NotificationBell
                userId={1}
                hasPending={true}
                pendingGames={[pendingGame]}
                onNewInvitation={vi.fn()}
                onAcceptInvitation={vi.fn()}
                onOpen={onOpen}
            />,
        );

        await userEvent.click(screen.getByRole('button', { name: 'Pending game invitations' }));

        expect(onOpen).toHaveBeenCalledTimes(1);
    });

    it('does not call onOpen when the bell is clicked to close the popup', async () => {
        buildEchoMock();
        const onOpen = vi.fn();

        render(
            <NotificationBell
                userId={1}
                hasPending={true}
                pendingGames={[pendingGame]}
                onNewInvitation={vi.fn()}
                onAcceptInvitation={vi.fn()}
                onOpen={onOpen}
            />,
        );

        const bell = screen.getByRole('button', { name: 'Pending game invitations' });

        // First click — opens popup.
        await userEvent.click(bell);
        expect(onOpen).toHaveBeenCalledTimes(1);

        // Second click — closes popup; onOpen should not be called again.
        await userEvent.click(bell);
        expect(onOpen).toHaveBeenCalledTimes(1);
    });

    it('does not throw when onOpen is not provided', async () => {
        buildEchoMock();

        expect(() =>
            render(
                <NotificationBell
                    userId={1}
                    hasPending={true}
                    pendingGames={[pendingGame]}
                    onNewInvitation={vi.fn()}
                    onAcceptInvitation={vi.fn()}
                />,
            ),
        ).not.toThrow();
    });

    // -------------------------------------------------------------------------
    // isLoadingGames prop
    // -------------------------------------------------------------------------

    it('shows a loading spinner instead of the games list when isLoadingGames is true', async () => {
        buildEchoMock();

        render(
            <NotificationBell
                userId={1}
                hasPending={true}
                pendingGames={[pendingGame]}
                onNewInvitation={vi.fn()}
                onAcceptInvitation={vi.fn()}
                isLoadingGames={true}
            />,
        );

        await userEvent.click(screen.getByRole('button', { name: 'Pending game invitations' }));

        expect(screen.getByLabelText('Loading invitations')).toBeInTheDocument();
        expect(screen.queryByText(pendingGame.name)).not.toBeInTheDocument();
    });

    it('shows the games list once isLoadingGames switches to false', async () => {
        buildEchoMock();
        const { rerender } = render(
            <NotificationBell
                userId={1}
                hasPending={true}
                pendingGames={[pendingGame]}
                onNewInvitation={vi.fn()}
                onAcceptInvitation={vi.fn()}
                isLoadingGames={true}
            />,
        );

        await userEvent.click(screen.getByRole('button', { name: 'Pending game invitations' }));
        expect(screen.getByLabelText('Loading invitations')).toBeInTheDocument();

        rerender(
            <NotificationBell
                userId={1}
                hasPending={true}
                pendingGames={[pendingGame]}
                onNewInvitation={vi.fn()}
                onAcceptInvitation={vi.fn()}
                isLoadingGames={false}
            />,
        );

        await waitFor(() => expect(screen.getByText(pendingGame.name)).toBeInTheDocument());
        expect(screen.queryByLabelText('Loading invitations')).not.toBeInTheDocument();
    });

    it('shows the empty state instead of spinner when isLoadingGames is false and no games', async () => {
        buildEchoMock();

        render(
            <NotificationBell
                userId={1}
                hasPending={true}
                pendingGames={[]}
                onNewInvitation={vi.fn()}
                onAcceptInvitation={vi.fn()}
                isLoadingGames={false}
            />,
        );

        await userEvent.click(screen.getByRole('button', { name: 'Pending game invitations' }));

        expect(screen.getByText('No pending invitations.')).toBeInTheDocument();
        expect(screen.queryByLabelText('Loading invitations')).not.toBeInTheDocument();
    });
});

