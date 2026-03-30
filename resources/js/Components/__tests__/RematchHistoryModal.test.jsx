import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import api from '@/api/client';
import RematchHistoryModal from '@/Components/RematchHistoryModal';

vi.mock('@/api/client', () => ({
    default: {
        get: vi.fn(),
    },
}));

const chainGames = [
    {
        id: 1,
        name: 'First Game',
        target_points: 2000,
        status: 'finished',
        winning_team_id: 1,
        current_round_number: 4,
        rematch_from_game_id: null,
    },
    {
        id: 2,
        name: 'Rematch One',
        target_points: 2000,
        status: 'finished',
        winning_team_id: 2,
        current_round_number: 3,
        rematch_from_game_id: 1,
    },
    {
        id: 3,
        name: 'Rematch Two',
        target_points: 2000,
        status: 'in_progress',
        winning_team_id: null,
        current_round_number: 1,
        rematch_from_game_id: 2,
    },
];

describe('RematchHistoryModal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders nothing when show is false', () => {
        const { container } = render(
            <RematchHistoryModal
                isOpen={false}
                onClose={vi.fn()}
                gameId={1}
                currentGameId={1}
            />,
        );

        expect(container.querySelector('[id="modal"]')).not.toBeInTheDocument();
    });

    it('shows a loading spinner while fetching the chain', async () => {
        api.get.mockReturnValueOnce(new Promise(() => {})); // never resolves

        render(
            <RematchHistoryModal
                isOpen={true}
                onClose={vi.fn()}
                gameId={1}
                currentGameId={1}
            />,
        );

        expect(screen.getByLabelText('Loading rematch history')).toBeInTheDocument();
    });

    it('renders all chain games after a successful fetch', async () => {
        api.get.mockResolvedValueOnce({
            data: { data: { games: chainGames } },
        });

        render(
            <RematchHistoryModal
                isOpen={true}
                onClose={vi.fn()}
                gameId={1}
                currentGameId={3}
            />,
        );

        await waitFor(() => expect(screen.getByText('First Game')).toBeInTheDocument());
        expect(screen.getByText('Rematch One')).toBeInTheDocument();
        expect(screen.getByText('Rematch Two')).toBeInTheDocument();
    });

    it('calls GET /games/{id}/rematch-chain with the correct game id', async () => {
        api.get.mockResolvedValueOnce({
            data: { data: { games: chainGames } },
        });

        render(
            <RematchHistoryModal
                isOpen={true}
                onClose={vi.fn()}
                gameId={42}
                currentGameId={42}
            />,
        );

        await waitFor(() =>
            expect(api.get).toHaveBeenCalledWith('/games/42/rematch-chain'),
        );
    });

    it('highlights the current game in the chain', async () => {
        api.get.mockResolvedValueOnce({
            data: { data: { games: chainGames } },
        });

        render(
            <RematchHistoryModal
                isOpen={true}
                onClose={vi.fn()}
                gameId={1}
                currentGameId={2}
            />,
        );

        await waitFor(() => expect(screen.getByText('Rematch One')).toBeInTheDocument());

        const currentLabel = screen.getByText('Current');
        expect(currentLabel).toBeInTheDocument();

        const listItem = currentLabel.closest('li');
        expect(listItem).toHaveClass('border-indigo-200');
    });

    it('shows status badges for each game in the chain', async () => {
        api.get.mockResolvedValueOnce({
            data: { data: { games: chainGames } },
        });

        render(
            <RematchHistoryModal
                isOpen={true}
                onClose={vi.fn()}
                gameId={1}
                currentGameId={3}
            />,
        );

        await waitFor(() => expect(screen.getByText('First Game')).toBeInTheDocument());

        const finishedBadges = screen.getAllByText('Finished');
        expect(finishedBadges).toHaveLength(2);
        expect(screen.getByText('In Progress')).toBeInTheDocument();
    });

    it('shows an error message when the fetch fails', async () => {
        api.get.mockRejectedValueOnce(new Error('Network error'));

        render(
            <RematchHistoryModal
                isOpen={true}
                onClose={vi.fn()}
                gameId={1}
                currentGameId={1}
            />,
        );

        await waitFor(() =>
            expect(
                screen.getByText('Unable to load rematch history right now. Please try again.'),
            ).toBeInTheDocument(),
        );
    });

    it('calls onClose when the Close button is clicked', async () => {
        api.get.mockResolvedValueOnce({
            data: { data: { games: chainGames } },
        });

        const onClose = vi.fn();

        render(
            <RematchHistoryModal
                isOpen={true}
                onClose={onClose}
                gameId={1}
                currentGameId={1}
            />,
        );

        await waitFor(() => expect(screen.getByText('First Game')).toBeInTheDocument());
        await userEvent.click(screen.getByRole('button', { name: 'Close' }));

        expect(onClose).toHaveBeenCalled();
    });

    it('does not call the API when isOpen becomes false', () => {
        render(
            <RematchHistoryModal
                isOpen={false}
                onClose={vi.fn()}
                gameId={1}
                currentGameId={1}
            />,
        );

        expect(api.get).not.toHaveBeenCalled();
    });

    it('re-fetches the chain when gameId changes while the modal is open', async () => {
        api.get.mockResolvedValueOnce({
            data: { data: { games: [chainGames[0]] } },
        });
        api.get.mockResolvedValueOnce({
            data: { data: { games: chainGames } },
        });

        const { rerender } = render(
            <RematchHistoryModal
                isOpen={true}
                onClose={vi.fn()}
                gameId={1}
                currentGameId={1}
            />,
        );

        await waitFor(() => expect(screen.getByText('First Game')).toBeInTheDocument());

        rerender(
            <RematchHistoryModal
                isOpen={true}
                onClose={vi.fn()}
                gameId={2}
                currentGameId={2}
            />,
        );

        await waitFor(() => expect(api.get).toHaveBeenNthCalledWith(2, '/games/2/rematch-chain'));
    });
});
