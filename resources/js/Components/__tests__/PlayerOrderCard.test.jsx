import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import api from '@/api/client';
import PlayerOrderCard from '@/Components/PlayerOrderCard';

vi.mock('@/api/client', () => ({
    default: {
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
    },
}));

const selectedGame = { id: 5, name: 'Friday Table', target_points: 2000, status: 'in_progress' };

const makeGameSummary = (teams = [], overrides = {}) => ({
    game: {
        id: 5,
        name: 'Friday Table',
        target_points: 2000,
        status: 'in_progress',
        current_round_number: 0,
        initial_shuffler_seat_number: null,
        ...(overrides.game ?? {}),
    },
    teams,
    rounds: overrides.rounds ?? [],
    round_roles: overrides.round_roles ?? [],
});

const makeTeam = (id, name, players = []) => ({
    id,
    name,
    current_score: 0,
    players,
});

describe('PlayerOrderCard', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('renders nothing when no game is selected', () => {
        const { container } = render(
            <PlayerOrderCard teams={[]} gameSummary={null} selectedGame={null} />,
        );

        expect(container.firstChild).toBeNull();
    });

    it('renders nothing when only one team exists', () => {
        const teams = [makeTeam(10, 'Team Alpha', [{ id: 1, user_id: null, display_name: 'Carlos' }])];
        const { container } = render(
            <PlayerOrderCard
                gameSummary={makeGameSummary(teams)}
                selectedGame={selectedGame}
                teams={teams}
            />,
        );

        expect(container.firstChild).toBeNull();
    });

    it('renders nothing when teams have mismatched player counts', () => {
        const teams = [
            makeTeam(10, 'Team Alpha', [{ id: 1, user_id: null, display_name: 'Carlos' }]),
            makeTeam(11, 'Team Beta', []),
        ];
        const { container } = render(
            <PlayerOrderCard
                gameSummary={makeGameSummary(teams)}
                selectedGame={selectedGame}
                teams={teams}
            />,
        );

        expect(container.firstChild).toBeNull();
    });

    it('renders nothing when the game is not in progress', () => {
        const finishedGame = { ...selectedGame, status: 'finished' };
        const teams = [
            makeTeam(10, 'Team Alpha', [{ id: 1, user_id: null, display_name: 'Carlos' }]),
            makeTeam(11, 'Team Beta', [{ id: 2, user_id: null, display_name: 'Bruno' }]),
        ];
        const { container } = render(
            <PlayerOrderCard
                gameSummary={makeGameSummary(teams)}
                selectedGame={finishedGame}
                teams={teams}
            />,
        );

        expect(container.firstChild).toBeNull();
    });

    it('shows cutter selector buttons even when players do not have seat numbers', () => {
        const teams = [
            makeTeam(10, 'Team Alpha', [{ id: 1, user_id: null, display_name: 'Carlos' }]),
            makeTeam(11, 'Team Beta', [{ id: 2, user_id: null, display_name: 'Bruno' }]),
        ];

        render(
            <PlayerOrderCard
                gameSummary={makeGameSummary(teams)}
                selectedGame={selectedGame}
                teams={teams}
            />,
        );

        expect(screen.getByText('Round 1 cutter')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Carlos' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Bruno' })).toBeInTheDocument();
    });

    it('sets the initial cutter from the UI', async () => {
        const teams = [
            makeTeam(10, 'Team Alpha', [
                { id: 1, user_id: null, display_name: 'Carlos', seat_number: 1 },
                { id: 3, user_id: null, display_name: 'Diana', seat_number: 3 },
            ]),
            makeTeam(11, 'Team Beta', [
                { id: 2, user_id: null, display_name: 'Bruno', seat_number: 2 },
                { id: 4, user_id: null, display_name: 'Elisa', seat_number: 4 },
            ]),
        ];

        api.put.mockResolvedValueOnce({
            data: {
                data: {
                    game: {
                        game: { id: 5, status: 'in_progress', current_round_number: 0, initial_shuffler_seat_number: 1 },
                        teams,
                        rounds: [],
                        round_roles: [
                            {
                                round_number: 1,
                                cutter: { player_id: 1, display_name: 'Carlos', seat_number: 1 },
                                dealer: { player_id: 2, display_name: 'Bruno', seat_number: 2 },
                                first_draw: { player_id: 3, display_name: 'Diana', seat_number: 3 },
                            },
                        ],
                    },
                },
            },
        });

        render(
            <PlayerOrderCard
                gameSummary={makeGameSummary(teams)}
                selectedGame={selectedGame}
                teams={teams}
            />,
        );

        expect(screen.getByText('Round 1 cutter')).toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', { name: 'Seat 1 · Carlos' }));

        await waitFor(() =>
            expect(api.put).toHaveBeenCalledWith('/games/5/shuffler', {
                player_id: 1,
            }),
        );
    });

    it('shows round 1 role labels in selector chips when roles are available', () => {
        const teams = [
            makeTeam(10, 'Team Alpha', [
                { id: 1, user_id: null, display_name: 'Carlos', seat_number: 1 },
                { id: 3, user_id: null, display_name: 'Diana', seat_number: 3 },
            ]),
            makeTeam(11, 'Team Beta', [
                { id: 2, user_id: null, display_name: 'Bruno', seat_number: 2 },
                { id: 4, user_id: null, display_name: 'Elisa', seat_number: 4 },
            ]),
        ];

        const gameSummary = makeGameSummary(teams, {
            game: { current_round_number: 0, initial_shuffler_seat_number: 1 },
            round_roles: [
                {
                    round_number: 1,
                    cutter: { player_id: 1, display_name: 'Carlos', seat_number: 1 },
                    dealer: { player_id: 2, display_name: 'Bruno', seat_number: 2 },
                    first_draw: { player_id: 3, display_name: 'Diana', seat_number: 3 },
                },
            ],
        });

        render(<PlayerOrderCard gameSummary={gameSummary} selectedGame={selectedGame} teams={teams} />);

        expect(screen.getByText('Round 1 cutter')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Seat 1 · Carlos · Cutter' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Seat 2 · Bruno · Dealer' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Seat 3 · Diana · First Draw' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Seat 4 · Elisa' })).toBeInTheDocument();
    });

    it('shows round N player order heading and correct roles after a round is recorded', () => {
        const teams = [
            makeTeam(10, 'Team Alpha', [
                { id: 1, user_id: null, display_name: 'Carlos', seat_number: 1 },
                { id: 3, user_id: null, display_name: 'Diana', seat_number: 3 },
            ]),
            makeTeam(11, 'Team Beta', [
                { id: 2, user_id: null, display_name: 'Bruno', seat_number: 2 },
                { id: 4, user_id: null, display_name: 'Elisa', seat_number: 4 },
            ]),
        ];

        const gameSummary = makeGameSummary(teams, {
            game: { current_round_number: 1, initial_shuffler_seat_number: 1 },
            round_roles: [
                {
                    round_number: 1,
                    cutter: { player_id: 1, display_name: 'Carlos', seat_number: 1 },
                    dealer: { player_id: 2, display_name: 'Bruno', seat_number: 2 },
                    first_draw: { player_id: 3, display_name: 'Diana', seat_number: 3 },
                },
                {
                    round_number: 2,
                    cutter: { player_id: 2, display_name: 'Bruno', seat_number: 2 },
                    dealer: { player_id: 3, display_name: 'Diana', seat_number: 3 },
                    first_draw: { player_id: 4, display_name: 'Elisa', seat_number: 4 },
                },
            ],
        });

        render(<PlayerOrderCard gameSummary={gameSummary} selectedGame={selectedGame} teams={teams} />);

        expect(screen.getByText('Round 2 player order')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Seat 2 · Bruno · Cutter' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Seat 1 · Carlos · Cutter' })).not.toBeInTheDocument();
        expect(screen.queryByText('R1 Cutter')).not.toBeInTheDocument();
        expect(screen.queryByText('R2 Dealer')).not.toBeInTheDocument();
    });

    it('shows read-only player order selector for the next round and does not allow clicks', async () => {
        const teams = [
            makeTeam(10, 'Team Alpha', [
                { id: 1, user_id: null, display_name: 'Carlos', seat_number: 1 },
                { id: 3, user_id: null, display_name: 'Diana', seat_number: 3 },
            ]),
            makeTeam(11, 'Team Beta', [
                { id: 2, user_id: null, display_name: 'Bruno', seat_number: 2 },
                { id: 4, user_id: null, display_name: 'Elisa', seat_number: 4 },
            ]),
        ];

        const gameSummary = makeGameSummary(teams, {
            game: { current_round_number: 1, initial_shuffler_seat_number: 1 },
            round_roles: [
                {
                    round_number: 1,
                    cutter: { player_id: 1, display_name: 'Carlos', seat_number: 1 },
                    dealer: { player_id: 2, display_name: 'Bruno', seat_number: 2 },
                    first_draw: { player_id: 3, display_name: 'Diana', seat_number: 3 },
                },
                {
                    round_number: 2,
                    cutter: { player_id: 2, display_name: 'Bruno', seat_number: 2 },
                    dealer: { player_id: 3, display_name: 'Diana', seat_number: 3 },
                    first_draw: { player_id: 4, display_name: 'Elisa', seat_number: 4 },
                },
            ],
        });

        render(<PlayerOrderCard gameSummary={gameSummary} selectedGame={selectedGame} teams={teams} />);

        expect(screen.getByText('Round 2 player order')).toBeInTheDocument();
        expect(screen.getByText('These are the players roles for this round.')).toBeInTheDocument();

        const brunoChip = screen.getByRole('button', { name: 'Seat 2 · Bruno · Cutter' });
        const dianaChip = screen.getByRole('button', { name: 'Seat 3 · Diana · Dealer' });
        const elisaChip = screen.getByRole('button', { name: 'Seat 4 · Elisa · First Draw' });
        const carlosChip = screen.getByRole('button', { name: 'Seat 1 · Carlos' });

        expect(brunoChip).toBeDisabled();
        expect(dianaChip).toBeDisabled();
        expect(elisaChip).toBeDisabled();
        expect(carlosChip).toBeDisabled();
        expect(brunoChip).toHaveClass('bg-blue-100');
        expect(dianaChip).toHaveClass('bg-amber-100');
        expect(elisaChip).toHaveClass('bg-green-100');
        expect(carlosChip).toHaveClass('bg-white');

        await userEvent.click(brunoChip);
        expect(api.put).not.toHaveBeenCalled();
    });

    it('shows "Add at least one player" message when no candidates exist', () => {
        const teams = [
            makeTeam(10, 'Team Alpha', []),
            makeTeam(11, 'Team Beta', []),
        ];

        render(
            <PlayerOrderCard
                gameSummary={makeGameSummary(teams)}
                selectedGame={selectedGame}
                teams={teams}
            />,
        );

        expect(screen.getByText('Add at least one player to assign the initial cutter.')).toBeInTheDocument();
    });

    it('renders a collapse button in the header on mobile', () => {
        const teams = [
            makeTeam(10, 'Team Alpha', [{ id: 1, user_id: null, display_name: 'Carlos', seat_number: 1 }]),
            makeTeam(11, 'Team Beta', [{ id: 2, user_id: null, display_name: 'Bruno', seat_number: 2 }]),
        ];

        render(
            <PlayerOrderCard
                gameSummary={makeGameSummary(teams)}
                selectedGame={selectedGame}
                teams={teams}
            />,
        );

        const collapseBtn = screen.getByRole('button', { name: 'Collapse player order' });
        expect(collapseBtn).toBeInTheDocument();
        expect(collapseBtn).toHaveAttribute('aria-expanded', 'true');
    });

    it('collapses the body when the collapse button is clicked', async () => {
        const teams = [
            makeTeam(10, 'Team Alpha', [{ id: 1, user_id: null, display_name: 'Carlos', seat_number: 1 }]),
            makeTeam(11, 'Team Beta', [{ id: 2, user_id: null, display_name: 'Bruno', seat_number: 2 }]),
        ];

        render(
            <PlayerOrderCard
                gameSummary={makeGameSummary(teams)}
                selectedGame={selectedGame}
                teams={teams}
            />,
        );

        expect(screen.getByRole('button', { name: 'Seat 1 · Carlos' })).toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', { name: 'Collapse player order' }));

        expect(screen.queryByRole('button', { name: 'Seat 1 · Carlos' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Expand player order' })).toHaveAttribute('aria-expanded', 'false');
    });

    it('disables all cutter chip buttons when the user is a viewer (even on round 1)', async () => {
        const viewerGame = { ...selectedGame, user_role: 'viewer' };
        const teams = [
            makeTeam(10, 'Team Alpha', [
                { id: 1, user_id: null, display_name: 'Carlos', seat_number: 1 },
                { id: 3, user_id: null, display_name: 'Diana', seat_number: 3 },
            ]),
            makeTeam(11, 'Team Beta', [
                { id: 2, user_id: null, display_name: 'Bruno', seat_number: 2 },
                { id: 4, user_id: null, display_name: 'Elisa', seat_number: 4 },
            ]),
        ];

        render(
            <PlayerOrderCard
                gameSummary={makeGameSummary(teams)}
                selectedGame={viewerGame}
                teams={teams}
            />,
        );

        expect(screen.getByText('Round 1 cutter')).toBeInTheDocument();

        const chips = screen.getAllByRole('button', { name: /Seat/ });
        chips.forEach((chip) => expect(chip).toBeDisabled());

        await userEvent.click(chips[0]);
        expect(api.put).not.toHaveBeenCalled();
    });

    it('expands the body again when the collapse button is clicked a second time', async () => {
        const teams = [
            makeTeam(10, 'Team Alpha', [{ id: 1, user_id: null, display_name: 'Carlos', seat_number: 1 }]),
            makeTeam(11, 'Team Beta', [{ id: 2, user_id: null, display_name: 'Bruno', seat_number: 2 }]),
        ];

        render(
            <PlayerOrderCard
                gameSummary={makeGameSummary(teams)}
                selectedGame={selectedGame}
                teams={teams}
            />,
        );

        await userEvent.click(screen.getByRole('button', { name: 'Collapse player order' }));
        expect(screen.queryByRole('button', { name: 'Seat 1 · Carlos' })).not.toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', { name: 'Expand player order' }));
        expect(screen.getByRole('button', { name: 'Seat 1 · Carlos' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Collapse player order' })).toHaveAttribute('aria-expanded', 'true');
    });
});
