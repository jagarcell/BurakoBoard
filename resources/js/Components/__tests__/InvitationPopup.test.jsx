import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InvitationPopup from '@/Components/InvitationPopup';

const game = { id: 7, name: 'Friday Burako', target_points: 2000 };

describe('InvitationPopup', () => {
    it('renders nothing when isVisible is false', () => {
        const { container } = render(
            <InvitationPopup
                game={game}
                isVisible={false}
                isAccepting={false}
                onAccept={vi.fn()}
                onClose={vi.fn()}
            />,
        );
        expect(container.firstChild).toBeNull();
    });

    it('renders nothing when game is null even if isVisible is true', () => {
        const { container } = render(
            <InvitationPopup
                game={null}
                isVisible={true}
                isAccepting={false}
                onAccept={vi.fn()}
                onClose={vi.fn()}
            />,
        );
        expect(container.firstChild).toBeNull();
    });

    it('renders the dialog with the game name when visible', () => {
        render(
            <InvitationPopup
                game={game}
                isVisible={true}
                isAccepting={false}
                onAccept={vi.fn()}
                onClose={vi.fn()}
            />,
        );
        expect(screen.getByRole('dialog', { name: 'New game invitation' })).toBeInTheDocument();
        expect(screen.getByText('Friday Burako')).toBeInTheDocument();
    });

    it('renders the Accept button with correct aria-label when visible', () => {
        render(
            <InvitationPopup
                game={game}
                isVisible={true}
                isAccepting={false}
                onAccept={vi.fn()}
                onClose={vi.fn()}
            />,
        );
        expect(
            screen.getByRole('button', { name: `Accept invitation to ${game.name}` }),
        ).toBeInTheDocument();
    });

    it('renders the close button when visible', () => {
        render(
            <InvitationPopup
                game={game}
                isVisible={true}
                isAccepting={false}
                onAccept={vi.fn()}
                onClose={vi.fn()}
            />,
        );
        expect(screen.getByRole('button', { name: 'Close invitation popup' })).toBeInTheDocument();
    });

    it('calls onClose when the × button is clicked', async () => {
        const onClose = vi.fn();
        render(
            <InvitationPopup
                game={game}
                isVisible={true}
                isAccepting={false}
                onAccept={vi.fn()}
                onClose={onClose}
            />,
        );
        await userEvent.click(screen.getByRole('button', { name: 'Close invitation popup' }));
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('calls onAccept with the game id when Accept is clicked', async () => {
        const onAccept = vi.fn();
        render(
            <InvitationPopup
                game={game}
                isVisible={true}
                isAccepting={false}
                onAccept={onAccept}
                onClose={vi.fn()}
            />,
        );
        await userEvent.click(
            screen.getByRole('button', { name: `Accept invitation to ${game.name}` }),
        );
        expect(onAccept).toHaveBeenCalledTimes(1);
        expect(onAccept).toHaveBeenCalledWith(game.id);
    });

    it('disables the Accept button and shows a spinner when isAccepting is true', () => {
        render(
            <InvitationPopup
                game={game}
                isVisible={true}
                isAccepting={true}
                onAccept={vi.fn()}
                onClose={vi.fn()}
            />,
        );
        const acceptBtn = screen.getByRole('button', {
            name: `Accept invitation to ${game.name}`,
        });
        expect(acceptBtn).toBeDisabled();
        expect(acceptBtn).toHaveTextContent('Accepting\u2026');
    });

    it('shows the "Accept" label (not spinner text) when isAccepting is false', () => {
        render(
            <InvitationPopup
                game={game}
                isVisible={true}
                isAccepting={false}
                onAccept={vi.fn()}
                onClose={vi.fn()}
            />,
        );
        const acceptBtn = screen.getByRole('button', {
            name: `Accept invitation to ${game.name}`,
        });
        expect(acceptBtn).not.toBeDisabled();
        expect(acceptBtn).toHaveTextContent('Accept');
    });

    it('does not call onAccept when the Accept button is clicked while accepting', async () => {
        const onAccept = vi.fn();
        render(
            <InvitationPopup
                game={game}
                isVisible={true}
                isAccepting={true}
                onAccept={onAccept}
                onClose={vi.fn()}
            />,
        );
        const acceptBtn = screen.getByRole('button', {
            name: `Accept invitation to ${game.name}`,
        });
        // Button is disabled — userEvent will not fire the click handler.
        await userEvent.click(acceptBtn);
        expect(onAccept).not.toHaveBeenCalled();
    });

    it('renders the "New Game Invitation" heading', () => {
        render(
            <InvitationPopup
                game={game}
                isVisible={true}
                isAccepting={false}
                onAccept={vi.fn()}
                onClose={vi.fn()}
            />,
        );
        expect(screen.getByText('New Game Invitation')).toBeInTheDocument();
    });
});
