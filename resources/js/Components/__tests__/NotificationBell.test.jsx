import '@testing-library/jest-dom/vitest';
import { render, screen, act } from '@testing-library/react';
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

    it('renders the bell icon when hasPending is true', () => {
        buildEchoMock();
        render(<NotificationBell userId={1} hasPending={true} onNewInvitation={vi.fn()} />);
        expect(screen.getByLabelText('Pending game invitations')).toBeInTheDocument();
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

    it('leaves the channel on unmount', () => {
        buildEchoMock();
        const { unmount } = render(
            <NotificationBell userId={3} hasPending={false} onNewInvitation={vi.fn()} />,
        );
        unmount();
        expect(window.Echo.leave).toHaveBeenCalledWith('App.Models.User.3');
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
});
