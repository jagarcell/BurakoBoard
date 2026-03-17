import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';
import PlayerOrderCard from '@/Components/PlayerOrderCard';

vi.mock('axios');

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

    it('shows shuffler selector buttons even when players do not have seat numbers', () => {
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

        expect(screen.getByText('Round 1 shuffler')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Carlos' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Bruno' })).toBeInTheDocument();
    });

    it('sets the initial shuffler from the UI', async () => {
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

        axios.put.mockResolvedValueOnce({
            data: {
                data: {
                    game: {
                        game: { id: 5, status: 'in_progress', current_round_number: 0, initial_shuffler_seat_number: 1 },
                        teams,
                        rounds: [],
                        round_roles: [
                            {
                                round_number: 1,
                                shuffler: { player_id: 1, display_name: 'Carlos', seat_number: 1 },
                                cutter: { player_id: 2, display_name: 'Bruno', seat_number: 2 },
                                dealer: { player_id: 3, display_name: 'Diana', seat_number: 3 },
                                first_draw: { player_id: 4, display_name: 'Elisa', seat_number: 4 },
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

        expect(screen.getByText('Round 1 shuffler')).toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', { name: 'Seat 1 · Carlos' }));

        await waitFor(() =>
            expect(axios.put).toHaveBeenCalledWith('/api/v1/games/5/shuffler', {
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
                    shuffler: { player_id: 1, display_name: 'Carlos', seat_number: 1 },
                    cutter: { player_id: 2, display_name: 'Bruno', seat_number: 2 },
                    dealer: { player_id: 3, display_name: 'Diana', seat_number: 3 },
                    first_draw: { player_id: 4, display_name: 'Elisa', seat_number: 4 },
                },
            ],
        });

        render(<PlayerOrderCard gameSummary={gameSummary} selectedGame={selectedGame} teams={teams} />);

        expect(screen.getByText('Round 1 shuffler')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Seat 1 · Carlos · Shuffler' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Seat 2 · Bruno · Cutter' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Seat 3 · Diana · Dealer' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Seat 4 · Elisa · First Draw' })).toBeInTheDocument();
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
                    shuffler: { player_id: 1, display_name: 'Carlos', seat_number: 1 },
                    cutter: { player_id: 2, display_name: 'Bruno', seat_number: 2 },
                    dealer: { player_id: 3, display_name: 'Diana', seat_number: 3 },
                    first_draw: { player_id: 4, display_name: 'Elisa', seat_number: 4 },
                },
                {
                    round_number: 2,
                    shuffler: { player_id: 2, display_name: 'Bruno', seat_number: 2 },
                    cutter: { player_id: 3, display_name: 'Diana', seat_number: 3 },
                    dealer: { player_id: 4, display_name: 'Elisa', seat_number: 4 },
                    first_draw: { player_id: 1, display_name: 'Carlos', seat_number: 1 },
                },
            ],
        });

        render(<PlayerOrderCard gameSummary={gameSummary} selectedGame={selectedGame} teams={teams} />);

        expect(screen.getByText('Round 2 player order')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Seat 2 · Bruno · Shuffler' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Seat 1 · Carlos · Shuffler' })).not.toBeInTheDocument();
        expect(screen.queryByText('R1 Shuffler')).not.toBeInTheDocument();
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
                    shuffler: { player_id: 1, display_name: 'Carlos', seat_number: 1 },
                    cutter: { player_id: 2, display_name: 'Bruno', seat_number: 2 },
                    dealer: { player_id: 3, display_name: 'Diana', seat_number: 3 },
                    first_draw: { player_id: 4, display_name: 'Elisa', seat_number: 4 },
                },
                {
                    round_number: 2,
                    shuffler: { player_id: 2, display_name: 'Bruno', seat_number: 2 },
                    cutter: { player_id: 3, display_name: 'Diana', seat_number: 3 },
                    dealer: { player_id: 4, display_name: 'Elisa', seat_number: 4 },
                    first_draw: { player_id: 1, display_name: 'Carlos', seat_number: 1 },
                },
            ],
        });

        render(<PlayerOrderCard gameSummary={gameSummary} selectedGame={selectedGame} teams={teams} />);

        expect(screen.getByText('Round 2 player order')).toBeInTheDocument();
        expect(screen.getByText('These are the players roles for this round.')).toBeInTheDocument();

        const brunoChip = screen.getByRole('button', { name: 'Seat 2 · Bruno · Shuffler' });
        const dianaChip = screen.getByRole('button', { name: 'Seat 3 · Diana · Cutter' });
        const elisaChip = screen.getByRole('button', { name: 'Seat 4 · Elisa · Dealer' });
        const carlosChip = screen.getByRole('button', { name: 'Seat 1 · Carlos · First Draw' });

        expect(brunoChip).toBeDisabled();
        expect(dianaChip).toBeDisabled();
        expect(elisaChip).toBeDisabled();
        expect(carlosChip).toBeDisabled();
        expect(brunoChip).toHaveClass('bg-indigo-600');
        expect(dianaChip).toHaveClass('bg-white');
        expect(elisaChip).toHaveClass('bg-white');
        expect(carlosChip).toHaveClass('bg-white');

        await userEvent.click(brunoChip);
        expect(axios.put).not.toHaveBeenCalled();
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

        expect(screen.getByText('Add at least one player to assign the initial shuffler.')).toBeInTheDocument();
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
