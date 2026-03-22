import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';
import GameCard from '@/Components/GameCard';

vi.mock('axios');

const twoGames = [
    {
        id: 8,
        name: 'Late Table',
        target_points: 2000,
        status: 'in_progress',
        winning_team_id: null,
        current_round_number: 0,
    },
    {
        id: 3,
        name: 'Early Table',
        target_points: 1500,
        status: 'finished',
        winning_team_id: 2,
        current_round_number: 4,
    },
];

const oneGame = [
    {
        id: 1,
        name: 'Existing Table',
        target_points: 2000,
        status: 'in_progress',
        winning_team_id: null,
        current_round_number: 0,
    },
];

const gamesWithRoles = [
    {
        id: 10,
        name: 'My Game',
        target_points: 2000,
        status: 'in_progress',
        winning_team_id: null,
        current_round_number: 0,
        user_role: 'creator',
    },
    {
        id: 11,
        name: 'Their Game',
        target_points: 2000,
        status: 'in_progress',
        winning_team_id: null,
        current_round_number: 0,
        user_role: 'viewer',
    },
    {
        id: 12,
        name: 'Pending Game',
        target_points: 2000,
        status: 'in_progress',
        winning_team_id: null,
        current_round_number: 0,
        user_role: 'pending_invitee',
    },
];

describe('GameCard', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.clearAllMocks();
    });

    it('shows the Select a game placeholder and no auto-selection on load', async () => {
        const onGameSelect = vi.fn();

        axios.get.mockResolvedValueOnce({
            data: { data: { games: twoGames } },
        });

        render(<GameCard onGameSelect={onGameSelect} />);

        const trigger = await screen.findByRole('combobox');
        await waitFor(() => expect(trigger).toHaveTextContent('Select a game'));

        expect(trigger).toHaveTextContent('Select a game');

        await waitFor(() =>
            expect(onGameSelect).toHaveBeenLastCalledWith(null),
        );
    });

    it('shows the New button when no game is selected and Edit button after selecting one', async () => {
        axios.get.mockResolvedValueOnce({
            data: { data: { games: twoGames } },
        });

        render(<GameCard onGameSelect={vi.fn()} />);

        const trigger = await screen.findByRole('combobox');
        await waitFor(() => expect(trigger).not.toBeDisabled());
        expect(trigger).toHaveTextContent('Select a game');
        expect(screen.getByRole('button', { name: 'New' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();

        await userEvent.click(trigger);
        await userEvent.click(screen.getByRole('option', { name: 'Late Table (2000 pts)' }));

        expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'New' })).not.toBeInTheDocument();
    });

    it('allows manual selection of a game from the dropdown', async () => {
        const onGameSelect = vi.fn();

        axios.get.mockResolvedValueOnce({
            data: { data: { games: twoGames } },
        });

        render(<GameCard onGameSelect={onGameSelect} />);

        const trigger = await screen.findByRole('combobox');
        await waitFor(() => expect(trigger).not.toBeDisabled());

        await userEvent.click(trigger);
        await userEvent.click(screen.getByRole('option', { name: 'Late Table (2000 pts)' }));

        await waitFor(() =>
            expect(onGameSelect).toHaveBeenLastCalledWith(
                expect.objectContaining({ id: 8, name: 'Late Table' }),
            ),
        );

        await userEvent.click(trigger);
        await userEvent.click(screen.getByRole('option', { name: 'Early Table (1500 pts)' }));

        await waitFor(() =>
            expect(onGameSelect).toHaveBeenLastCalledWith(
                expect.objectContaining({ id: 3, name: 'Early Table' }),
            ),
        );
    });

    it('creates a new game, closes the dialog, and selects the created game', async () => {
        const onGameSelect = vi.fn();

        axios.get.mockResolvedValueOnce({
            data: { data: { games: oneGame } },
        });

        axios.post.mockResolvedValueOnce({
            data: {
                data: {
                    game: {
                        game: {
                            id: 12,
                            name: 'Finals Table',
                            target_points: 3000,
                            status: 'in_progress',
                            winning_team_id: null,
                            current_round_number: 0,
                        },
                        teams: [],
                        rounds: [],
                    },
                },
            },
        });

        render(<GameCard onGameSelect={onGameSelect} />);

        const trigger = await screen.findByRole('combobox');
        await waitFor(() => expect(trigger).toHaveTextContent('Select a game'));

        await userEvent.click(screen.getByRole('button', { name: 'New' }));

        await userEvent.type(screen.getByLabelText('Game name'), 'Finals Table');
        await userEvent.clear(screen.getByLabelText('Winning score'));
        await userEvent.type(screen.getByLabelText('Winning score'), '3000');
        await userEvent.click(screen.getByRole('button', { name: 'Accept' }));

        await waitFor(() =>
            expect(axios.post).toHaveBeenCalledWith('/api/v1/games', {
                name: 'Finals Table',
                target_points: 3000,
            }),
        );

        await waitFor(() =>
            expect(screen.queryByText('Create a new game')).not.toBeInTheDocument(),
        );

        await waitFor(() => expect(trigger).toHaveTextContent(/Finals Table/));

        // Role indicator must appear immediately without a page refresh.
        expect(trigger.querySelector('[title="Creator"]')).toBeInTheDocument();

        await waitFor(() =>
            expect(onGameSelect).toHaveBeenLastCalledWith(
                expect.objectContaining({ id: 12, name: 'Finals Table', user_role: 'creator' }),
            ),
        );
    });

    it('opens the edit modal pre-populated, submits a PUT request, and updates the game in the list', async () => {
        const onGameSelect = vi.fn();

        axios.get.mockResolvedValueOnce({
            data: { data: { games: twoGames } },
        });

        axios.put.mockResolvedValueOnce({
            data: {
                data: {
                    game: {
                        id: 8,
                        name: 'Late Table Renamed',
                        target_points: 2500,
                        status: 'in_progress',
                        winning_team_id: null,
                        current_round_number: 0,
                    },
                },
            },
        });

        render(<GameCard onGameSelect={onGameSelect} />);

        const trigger = await screen.findByRole('combobox');
        await waitFor(() => expect(trigger).not.toBeDisabled());

        await userEvent.click(trigger);
        await userEvent.click(screen.getByRole('option', { name: 'Late Table (2000 pts)' }));

        await userEvent.click(screen.getByRole('button', { name: 'Edit' }));

        expect(screen.getByText('Edit game')).toBeInTheDocument();

        const nameInput = screen.getByLabelText('Game name');
        const scoreInput = screen.getByLabelText('Winning score');

        expect(nameInput).toHaveValue('Late Table');
        expect(scoreInput).toHaveValue(2000);

        await userEvent.clear(nameInput);
        await userEvent.type(nameInput, 'Late Table Renamed');
        await userEvent.clear(scoreInput);
        await userEvent.type(scoreInput, '2500');

        await userEvent.click(screen.getByRole('button', { name: 'Save' }));

        await waitFor(() =>
            expect(axios.put).toHaveBeenCalledWith('/api/v1/games/8', {
                name: 'Late Table Renamed',
                target_points: 2500,
            }),
        );

        await waitFor(() =>
            expect(screen.queryByText('Edit game')).not.toBeInTheDocument(),
        );

        await waitFor(() => expect(trigger).toHaveTextContent(/Late Table Renamed/));

        await userEvent.click(trigger);
        expect(
            screen.getByRole('option', { name: 'Late Table Renamed (2500 pts)' }),
        ).toBeInTheDocument();
    });

    it('keeps the selector on the placeholder option when returning to it after a selection', async () => {
        axios.get.mockResolvedValueOnce({
            data: { data: { games: twoGames } },
        });

        render(<GameCard onGameSelect={vi.fn()} />);

        const trigger = await screen.findByRole('combobox');
        await waitFor(() => expect(trigger).not.toBeDisabled());

        await userEvent.click(trigger);
        await userEvent.click(screen.getByRole('option', { name: 'Late Table (2000 pts)' }));
        expect(trigger).toHaveTextContent(/Late Table/);

        await userEvent.click(trigger);
        await userEvent.click(screen.getByRole('option', { name: 'Select a game' }));
        expect(trigger).toHaveTextContent('Select a game');
        expect(screen.getByRole('button', { name: 'New' })).toBeInTheDocument();
    });

    it('persists the selected game id to localStorage when a game is chosen', async () => {
        axios.get.mockResolvedValueOnce({
            data: { data: { games: twoGames } },
        });

        render(<GameCard onGameSelect={vi.fn()} />);

        const trigger = await screen.findByRole('combobox');
        await waitFor(() => expect(trigger).not.toBeDisabled());

        await userEvent.click(trigger);
        await userEvent.click(screen.getByRole('option', { name: 'Late Table (2000 pts)' }));

        expect(localStorage.getItem('burako_selected_game_id')).toBe('8');
    });

    it('restores the previously selected game from localStorage on mount', async () => {
        localStorage.setItem('burako_selected_game_id', '8');

        const onGameSelect = vi.fn();

        axios.get.mockResolvedValueOnce({
            data: { data: { games: twoGames } },
        });

        render(<GameCard onGameSelect={onGameSelect} />);

        const trigger = await screen.findByRole('combobox');
        await waitFor(() => expect(trigger).toHaveTextContent(/Late Table/));
        await waitFor(() =>
            expect(onGameSelect).toHaveBeenLastCalledWith(
                expect.objectContaining({ id: 8, name: 'Late Table' }),
            ),
        );
    });

    it('ignores a stale localStorage game id when the game no longer exists in the list', async () => {
        localStorage.setItem('burako_selected_game_id', '999');

        const onGameSelect = vi.fn();

        axios.get.mockResolvedValueOnce({
            data: { data: { games: twoGames } },
        });

        render(<GameCard onGameSelect={onGameSelect} />);

        const trigger = await screen.findByRole('combobox');
        await waitFor(() => expect(trigger).toHaveTextContent('Select a game'));
        await waitFor(() =>
            expect(onGameSelect).toHaveBeenLastCalledWith(null),
        );
    });

    it('removes the localStorage entry when the placeholder is selected', async () => {
        localStorage.setItem('burako_selected_game_id', '8');

        axios.get.mockResolvedValueOnce({
            data: { data: { games: twoGames } },
        });

        render(<GameCard onGameSelect={vi.fn()} />);

        const trigger = await screen.findByRole('combobox');
        await waitFor(() => expect(trigger).toHaveTextContent(/Late Table/));

        await userEvent.click(trigger);
        await userEvent.click(screen.getByRole('option', { name: 'Select a game' }));

        expect(localStorage.getItem('burako_selected_game_id')).toBeNull();
    });

    it('shows role icon badges in the open dropdown for creator, viewer, and pending_invitee', async () => {
        axios.get.mockResolvedValueOnce({
            data: { data: { games: gamesWithRoles } },
        });

        render(<GameCard onGameSelect={vi.fn()} />);

        const trigger = await screen.findByRole('combobox');
        await waitFor(() => expect(trigger).not.toBeDisabled());
        await userEvent.click(trigger);

        expect(screen.getByTitle('Creator')).toBeInTheDocument();
        expect(screen.getByTitle('Viewer')).toBeInTheDocument();
        expect(screen.getByTitle('Pending invite')).toBeInTheDocument();
    });

    it('shows the creator icon in the trigger after selecting a creator game', async () => {
        axios.get.mockResolvedValueOnce({
            data: { data: { games: gamesWithRoles } },
        });

        render(<GameCard onGameSelect={vi.fn()} />);

        const trigger = await screen.findByRole('combobox');
        await waitFor(() => expect(trigger).not.toBeDisabled());
        await userEvent.click(trigger);
        await userEvent.click(screen.getByRole('option', { name: 'My Game (2000 pts)' }));

        expect(screen.getByTitle('Creator')).toBeInTheDocument();
    });

    it('shows the viewer icon in the trigger after selecting a viewer game', async () => {
        axios.get.mockResolvedValueOnce({
            data: { data: { games: gamesWithRoles } },
        });

        render(<GameCard onGameSelect={vi.fn()} />);

        const trigger = await screen.findByRole('combobox');
        await waitFor(() => expect(trigger).not.toBeDisabled());
        await userEvent.click(trigger);
        await userEvent.click(screen.getByRole('option', { name: 'Their Game (2000 pts)' }));

        expect(screen.getByTitle('Viewer')).toBeInTheDocument();
    });

    it('shows the pending invite icon in the trigger after selecting a pending_invitee game', async () => {
        axios.get.mockResolvedValueOnce({
            data: { data: { games: gamesWithRoles } },
        });

        render(<GameCard onGameSelect={vi.fn()} />);

        const trigger = await screen.findByRole('combobox');
        await waitFor(() => expect(trigger).not.toBeDisabled());
        await userEvent.click(trigger);
        await userEvent.click(screen.getByRole('option', { name: 'Pending Game (2000 pts)' }));

        expect(screen.getByTitle('Pending invite')).toBeInTheDocument();
    });

    it('shows the Invite Viewer button when a creator game is selected', async () => {
        axios.get.mockResolvedValueOnce({
            data: { data: { games: gamesWithRoles } },
        });

        render(<GameCard onGameSelect={vi.fn()} />);

        const trigger = await screen.findByRole('combobox');
        await waitFor(() => expect(trigger).not.toBeDisabled());
        await userEvent.click(trigger);
        await userEvent.click(screen.getByRole('option', { name: 'My Game (2000 pts)' }));

        expect(
            screen.getByRole('button', { name: 'Invite a viewer to this game' }),
        ).toBeInTheDocument();
    });

    it('does not show the Invite Viewer button when a non-creator game is selected', async () => {
        axios.get.mockResolvedValueOnce({
            data: { data: { games: gamesWithRoles } },
        });

        render(<GameCard onGameSelect={vi.fn()} />);

        const trigger = await screen.findByRole('combobox');
        await waitFor(() => expect(trigger).not.toBeDisabled());
        await userEvent.click(trigger);
        await userEvent.click(screen.getByRole('option', { name: 'Their Game (2000 pts)' }));

        expect(
            screen.queryByRole('button', { name: 'Invite a viewer to this game' }),
        ).not.toBeInTheDocument();
    });

    it('does not show the Invite Viewer button when no game is selected', async () => {
        axios.get.mockResolvedValueOnce({
            data: { data: { games: gamesWithRoles } },
        });

        render(<GameCard onGameSelect={vi.fn()} />);

        await screen.findByRole('combobox');

        expect(
            screen.queryByRole('button', { name: 'Invite a viewer to this game' }),
        ).not.toBeInTheDocument();
    });

    it('shows the Accept Invite button when a pending_invitee game is selected', async () => {
        axios.get.mockResolvedValueOnce({
            data: { data: { games: gamesWithRoles } },
        });

        render(<GameCard onGameSelect={vi.fn()} />);

        const trigger = await screen.findByRole('combobox');
        await waitFor(() => expect(trigger).not.toBeDisabled());
        await userEvent.click(trigger);
        await userEvent.click(screen.getByRole('option', { name: 'Pending Game (2000 pts)' }));

        expect(
            screen.getByRole('button', { name: 'Accept invitation to this game' }),
        ).toBeInTheDocument();
    });

    it('does not show the Accept Invite button when a non-pending game is selected', async () => {
        axios.get.mockResolvedValueOnce({
            data: { data: { games: gamesWithRoles } },
        });

        render(<GameCard onGameSelect={vi.fn()} />);

        const trigger = await screen.findByRole('combobox');
        await waitFor(() => expect(trigger).not.toBeDisabled());
        await userEvent.click(trigger);
        await userEvent.click(screen.getByRole('option', { name: 'My Game (2000 pts)' }));

        expect(
            screen.queryByRole('button', { name: 'Accept invitation to this game' }),
        ).not.toBeInTheDocument();
    });

    it('does not show the Accept Invite button when no game is selected', async () => {
        axios.get.mockResolvedValueOnce({
            data: { data: { games: gamesWithRoles } },
        });

        render(<GameCard onGameSelect={vi.fn()} />);

        await screen.findByRole('combobox');

        expect(
            screen.queryByRole('button', { name: 'Accept invitation to this game' }),
        ).not.toBeInTheDocument();
    });

    // -------------------------------------------------------------------------
    // Invite Viewer modal
    // -------------------------------------------------------------------------

    it('opens the invite modal and shows a loading spinner when Invite Viewer is clicked', async () => {
        axios.get.mockResolvedValueOnce({
            data: { data: { games: gamesWithRoles } },
        });

        // Delay the invitable-users response so the spinner is visible
        axios.get.mockReturnValueOnce(new Promise(() => {}));

        render(<GameCard onGameSelect={vi.fn()} />);

        const trigger = await screen.findByRole('combobox');
        await waitFor(() => expect(trigger).not.toBeDisabled());
        await userEvent.click(trigger);
        await userEvent.click(screen.getByRole('option', { name: 'My Game (2000 pts)' }));

        await userEvent.click(
            screen.getByRole('button', { name: 'Invite a viewer to this game' }),
        );

        expect(screen.getByText('Invite a Viewer')).toBeInTheDocument();
        expect(screen.getByLabelText('Loading users')).toBeInTheDocument();
    });

    it('shows the list of invitable users with checkboxes after the modal loads', async () => {
        axios.get.mockResolvedValueOnce({
            data: { data: { games: gamesWithRoles } },
        });

        axios.get.mockResolvedValueOnce({
            data: {
                data: {
                    users: {
                        data: [
                            { id: 101, name: 'Alice' },
                            { id: 102, name: 'Bob' },
                        ],
                        meta: { current_page: 1, last_page: 1, total: 2, per_page: 10 },
                        links: {},
                    },
                },
            },
        });

        render(<GameCard onGameSelect={vi.fn()} />);

        const trigger = await screen.findByRole('combobox');
        await waitFor(() => expect(trigger).not.toBeDisabled());
        await userEvent.click(trigger);
        await userEvent.click(screen.getByRole('option', { name: 'My Game (2000 pts)' }));

        await userEvent.click(
            screen.getByRole('button', { name: 'Invite a viewer to this game' }),
        );

        await waitFor(() =>
            expect(screen.getByText('Alice')).toBeInTheDocument(),
        );

        expect(screen.getByText('Bob')).toBeInTheDocument();

        const checkboxes = screen.getAllByRole('checkbox');
        expect(checkboxes).toHaveLength(2);
        checkboxes.forEach((cb) => expect(cb).not.toBeChecked());
    });

    it('fetches invitable users from the correct game endpoint when the modal opens', async () => {
        axios.get.mockResolvedValueOnce({
            data: { data: { games: gamesWithRoles } },
        });

        axios.get.mockResolvedValueOnce({
            data: {
                data: {
                    users: {
                        data: [],
                        meta: { current_page: 1, last_page: 1, total: 0, per_page: 10 },
                        links: {},
                    },
                },
            },
        });

        render(<GameCard onGameSelect={vi.fn()} />);

        const trigger = await screen.findByRole('combobox');
        await waitFor(() => expect(trigger).not.toBeDisabled());
        await userEvent.click(trigger);
        await userEvent.click(screen.getByRole('option', { name: 'My Game (2000 pts)' }));

        await userEvent.click(
            screen.getByRole('button', { name: 'Invite a viewer to this game' }),
        );

        await waitFor(() =>
            expect(axios.get).toHaveBeenCalledWith(
                '/api/v1/games/10/invitable-users',
                expect.objectContaining({ params: { page: 1 } }),
            ),
        );
    });

    it('toggles a user checkbox on and off when clicked', async () => {
        axios.get.mockResolvedValueOnce({
            data: { data: { games: gamesWithRoles } },
        });

        axios.get.mockResolvedValueOnce({
            data: {
                data: {
                    users: {
                        data: [{ id: 101, name: 'Alice' }],
                        meta: { current_page: 1, last_page: 1, total: 1, per_page: 10 },
                        links: {},
                    },
                },
            },
        });

        render(<GameCard onGameSelect={vi.fn()} />);

        const trigger = await screen.findByRole('combobox');
        await waitFor(() => expect(trigger).not.toBeDisabled());
        await userEvent.click(trigger);
        await userEvent.click(screen.getByRole('option', { name: 'My Game (2000 pts)' }));

        await userEvent.click(
            screen.getByRole('button', { name: 'Invite a viewer to this game' }),
        );

        const checkbox = await screen.findByRole('checkbox');
        expect(checkbox).not.toBeChecked();

        await userEvent.click(checkbox);
        expect(checkbox).toBeChecked();

        await userEvent.click(checkbox);
        expect(checkbox).not.toBeChecked();
    });

    it('shows an empty state message when there are no invitable users', async () => {
        axios.get.mockResolvedValueOnce({
            data: { data: { games: gamesWithRoles } },
        });

        axios.get.mockResolvedValueOnce({
            data: {
                data: {
                    users: {
                        data: [],
                        meta: { current_page: 1, last_page: 1, total: 0, per_page: 10 },
                        links: {},
                    },
                },
            },
        });

        render(<GameCard onGameSelect={vi.fn()} />);

        const trigger = await screen.findByRole('combobox');
        await waitFor(() => expect(trigger).not.toBeDisabled());
        await userEvent.click(trigger);
        await userEvent.click(screen.getByRole('option', { name: 'My Game (2000 pts)' }));

        await userEvent.click(
            screen.getByRole('button', { name: 'Invite a viewer to this game' }),
        );

        await waitFor(() =>
            expect(screen.getByText('No users available to invite.')).toBeInTheDocument(),
        );
    });

    it('shows an error message when the invitable users request fails', async () => {
        axios.get.mockResolvedValueOnce({
            data: { data: { games: gamesWithRoles } },
        });

        axios.get.mockRejectedValueOnce(new Error('Network Error'));

        render(<GameCard onGameSelect={vi.fn()} />);

        const trigger = await screen.findByRole('combobox');
        await waitFor(() => expect(trigger).not.toBeDisabled());
        await userEvent.click(trigger);
        await userEvent.click(screen.getByRole('option', { name: 'My Game (2000 pts)' }));

        await userEvent.click(
            screen.getByRole('button', { name: 'Invite a viewer to this game' }),
        );

        await waitFor(() =>
            expect(screen.getByText('Unable to load users right now.')).toBeInTheDocument(),
        );
    });

    it('shows pagination controls when there are multiple pages of invitable users', async () => {
        axios.get.mockResolvedValueOnce({
            data: { data: { games: gamesWithRoles } },
        });

        axios.get.mockResolvedValueOnce({
            data: {
                data: {
                    users: {
                        data: Array.from({ length: 10 }, (_, i) => ({
                            id: i + 1,
                            name: `User ${i + 1}`,
                        })),
                        meta: { current_page: 1, last_page: 3, total: 25, per_page: 10 },
                        links: {},
                    },
                },
            },
        });

        render(<GameCard onGameSelect={vi.fn()} />);

        const trigger = await screen.findByRole('combobox');
        await waitFor(() => expect(trigger).not.toBeDisabled());
        await userEvent.click(trigger);
        await userEvent.click(screen.getByRole('option', { name: 'My Game (2000 pts)' }));

        await userEvent.click(
            screen.getByRole('button', { name: 'Invite a viewer to this game' }),
        );

        await waitFor(() =>
            expect(screen.getByText('Page 1 of 3')).toBeInTheDocument(),
        );

        expect(screen.getByRole('button', { name: /Prev/i })).toBeDisabled();
        expect(screen.getByRole('button', { name: /Next/i })).not.toBeDisabled();
    });

    it('fetches the next page when the Next button is clicked', async () => {
        axios.get.mockResolvedValueOnce({
            data: { data: { games: gamesWithRoles } },
        });

        // Page 1
        axios.get.mockResolvedValueOnce({
            data: {
                data: {
                    users: {
                        data: Array.from({ length: 10 }, (_, i) => ({
                            id: i + 1,
                            name: `User ${i + 1}`,
                        })),
                        meta: { current_page: 1, last_page: 2, total: 11, per_page: 10 },
                        links: {},
                    },
                },
            },
        });

        // Page 2
        axios.get.mockResolvedValueOnce({
            data: {
                data: {
                    users: {
                        data: [{ id: 11, name: 'User 11' }],
                        meta: { current_page: 2, last_page: 2, total: 11, per_page: 10 },
                        links: {},
                    },
                },
            },
        });

        render(<GameCard onGameSelect={vi.fn()} />);

        const trigger = await screen.findByRole('combobox');
        await waitFor(() => expect(trigger).not.toBeDisabled());
        await userEvent.click(trigger);
        await userEvent.click(screen.getByRole('option', { name: 'My Game (2000 pts)' }));

        await userEvent.click(
            screen.getByRole('button', { name: 'Invite a viewer to this game' }),
        );

        await waitFor(() =>
            expect(screen.getByText('Page 1 of 2')).toBeInTheDocument(),
        );

        await userEvent.click(screen.getByRole('button', { name: /Next/i }));

        await waitFor(() =>
            expect(screen.getByText('Page 2 of 2')).toBeInTheDocument(),
        );

        expect(screen.getByText('User 11')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Next/i })).toBeDisabled();
    });

    it('does not show pagination controls when there is only one page', async () => {
        axios.get.mockResolvedValueOnce({
            data: { data: { games: gamesWithRoles } },
        });

        axios.get.mockResolvedValueOnce({
            data: {
                data: {
                    users: {
                        data: [{ id: 1, name: 'Alice' }],
                        meta: { current_page: 1, last_page: 1, total: 1, per_page: 10 },
                        links: {},
                    },
                },
            },
        });

        render(<GameCard onGameSelect={vi.fn()} />);

        const trigger = await screen.findByRole('combobox');
        await waitFor(() => expect(trigger).not.toBeDisabled());
        await userEvent.click(trigger);
        await userEvent.click(screen.getByRole('option', { name: 'My Game (2000 pts)' }));

        await userEvent.click(
            screen.getByRole('button', { name: 'Invite a viewer to this game' }),
        );

        await waitFor(() =>
            expect(screen.getByText('Alice')).toBeInTheDocument(),
        );

        expect(screen.queryByText(/Page \d+ of \d+/)).not.toBeInTheDocument();
    });

    it('closes the invite modal when the Close button is clicked', async () => {
        axios.get.mockResolvedValueOnce({
            data: { data: { games: gamesWithRoles } },
        });

        axios.get.mockResolvedValueOnce({
            data: {
                data: {
                    users: {
                        data: [{ id: 1, name: 'Alice' }],
                        meta: { current_page: 1, last_page: 1, total: 1, per_page: 10 },
                        links: {},
                    },
                },
            },
        });

        render(<GameCard onGameSelect={vi.fn()} />);

        const trigger = await screen.findByRole('combobox');
        await waitFor(() => expect(trigger).not.toBeDisabled());
        await userEvent.click(trigger);
        await userEvent.click(screen.getByRole('option', { name: 'My Game (2000 pts)' }));

        await userEvent.click(
            screen.getByRole('button', { name: 'Invite a viewer to this game' }),
        );

        await waitFor(() =>
            expect(screen.getByText('Alice')).toBeInTheDocument(),
        );

        await userEvent.click(screen.getByRole('button', { name: 'Close' }));

        await waitFor(() =>
            expect(screen.queryByText('Invite a Viewer')).not.toBeInTheDocument(),
        );
    });

    it('Send button is disabled when no users are selected', async () => {
        axios.get.mockResolvedValueOnce({
            data: { data: { games: gamesWithRoles } },
        });

        axios.get.mockResolvedValueOnce({
            data: {
                data: {
                    users: {
                        data: [{ id: 101, name: 'Alice' }],
                        meta: { current_page: 1, last_page: 1, total: 1, per_page: 10 },
                        links: {},
                    },
                },
            },
        });

        render(<GameCard onGameSelect={vi.fn()} />);

        const trigger = await screen.findByRole('combobox');
        await waitFor(() => expect(trigger).not.toBeDisabled());
        await userEvent.click(trigger);
        await userEvent.click(screen.getByRole('option', { name: 'My Game (2000 pts)' }));

        await userEvent.click(
            screen.getByRole('button', { name: 'Invite a viewer to this game' }),
        );

        await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument());

        expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    });

    it('Send button is enabled when at least one user is selected', async () => {
        axios.get.mockResolvedValueOnce({
            data: { data: { games: gamesWithRoles } },
        });

        axios.get.mockResolvedValueOnce({
            data: {
                data: {
                    users: {
                        data: [{ id: 101, name: 'Alice' }],
                        meta: { current_page: 1, last_page: 1, total: 1, per_page: 10 },
                        links: {},
                    },
                },
            },
        });

        render(<GameCard onGameSelect={vi.fn()} />);

        const trigger = await screen.findByRole('combobox');
        await waitFor(() => expect(trigger).not.toBeDisabled());
        await userEvent.click(trigger);
        await userEvent.click(screen.getByRole('option', { name: 'My Game (2000 pts)' }));

        await userEvent.click(
            screen.getByRole('button', { name: 'Invite a viewer to this game' }),
        );

        await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument());

        await userEvent.click(screen.getByRole('checkbox'));

        expect(screen.getByRole('button', { name: 'Send' })).not.toBeDisabled();
    });

    it('posts selected user IDs and shows a success message after clicking Send', async () => {
        const usersResponse = {
            data: {
                data: {
                    users: {
                        data: [
                            { id: 101, name: 'Alice' },
                            { id: 102, name: 'Bob' },
                        ],
                        meta: { current_page: 1, last_page: 1, total: 2, per_page: 10 },
                        links: {},
                    },
                },
            },
        };

        axios.get.mockResolvedValueOnce({ data: { data: { games: gamesWithRoles } } });
        axios.get.mockResolvedValueOnce(usersResponse);
        // The refreshed user list after send (both users now invited, list is empty)
        axios.get.mockResolvedValueOnce({
            data: {
                data: {
                    users: {
                        data: [],
                        meta: { current_page: 1, last_page: 1, total: 0, per_page: 10 },
                        links: {},
                    },
                },
            },
        });

        axios.post.mockResolvedValueOnce({
            data: { status: 'success', data: { invited_count: 1, message: '1 invitation sent.' }, meta: {}, links: {}, http_code: 201 },
        });

        render(<GameCard onGameSelect={vi.fn()} />);

        const trigger = await screen.findByRole('combobox');
        await waitFor(() => expect(trigger).not.toBeDisabled());
        await userEvent.click(trigger);
        await userEvent.click(screen.getByRole('option', { name: 'My Game (2000 pts)' }));

        await userEvent.click(
            screen.getByRole('button', { name: 'Invite a viewer to this game' }),
        );

        await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument());

        // Select only Alice
        const checkboxes = screen.getAllByRole('checkbox');
        await userEvent.click(checkboxes[0]);

        await userEvent.click(screen.getByRole('button', { name: 'Send' }));

        await waitFor(() =>
            expect(axios.post).toHaveBeenCalledWith(
                '/api/v1/games/10/invitations',
                { user_ids: [101] },
            ),
        );

        await waitFor(() =>
            expect(screen.getByText('1 invitation sent successfully.')).toBeInTheDocument(),
        );
    });

    it('shows an error message when the send invitations request fails', async () => {
        axios.get.mockResolvedValueOnce({ data: { data: { games: gamesWithRoles } } });
        axios.get.mockResolvedValueOnce({
            data: {
                data: {
                    users: {
                        data: [{ id: 101, name: 'Alice' }],
                        meta: { current_page: 1, last_page: 1, total: 1, per_page: 10 },
                        links: {},
                    },
                },
            },
        });

        axios.post.mockRejectedValueOnce(new Error('Network Error'));

        render(<GameCard onGameSelect={vi.fn()} />);

        const trigger = await screen.findByRole('combobox');
        await waitFor(() => expect(trigger).not.toBeDisabled());
        await userEvent.click(trigger);
        await userEvent.click(screen.getByRole('option', { name: 'My Game (2000 pts)' }));

        await userEvent.click(
            screen.getByRole('button', { name: 'Invite a viewer to this game' }),
        );

        await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument());

        await userEvent.click(screen.getByRole('checkbox'));
        await userEvent.click(screen.getByRole('button', { name: 'Send' }));

        await waitFor(() =>
            expect(
                screen.getByText('Unable to send invitations right now. Please try again.'),
            ).toBeInTheDocument(),
        );
    });

    it('resets selections and refreshes the user list after a successful send', async () => {
        axios.get.mockResolvedValueOnce({ data: { data: { games: gamesWithRoles } } });
        axios.get.mockResolvedValueOnce({
            data: {
                data: {
                    users: {
                        data: [{ id: 101, name: 'Alice' }],
                        meta: { current_page: 1, last_page: 1, total: 1, per_page: 10 },
                        links: {},
                    },
                },
            },
        });
        // Refreshed list returns empty (Alice was invited)
        axios.get.mockResolvedValueOnce({
            data: {
                data: {
                    users: {
                        data: [],
                        meta: { current_page: 1, last_page: 1, total: 0, per_page: 10 },
                        links: {},
                    },
                },
            },
        });

        axios.post.mockResolvedValueOnce({
            data: { status: 'success', data: { invited_count: 1 }, meta: {}, links: {}, http_code: 201 },
        });

        render(<GameCard onGameSelect={vi.fn()} />);

        const trigger = await screen.findByRole('combobox');
        await waitFor(() => expect(trigger).not.toBeDisabled());
        await userEvent.click(trigger);
        await userEvent.click(screen.getByRole('option', { name: 'My Game (2000 pts)' }));

        await userEvent.click(
            screen.getByRole('button', { name: 'Invite a viewer to this game' }),
        );

        await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument());

        await userEvent.click(screen.getByRole('checkbox'));
        expect(screen.getByRole('button', { name: 'Send' })).not.toBeDisabled();

        await userEvent.click(screen.getByRole('button', { name: 'Send' }));

        await waitFor(() =>
            expect(screen.getByText('No users available to invite.')).toBeInTheDocument(),
        );

        // Send button should be disabled again since selection is cleared and no users are shown
        expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    });

    it('shows the Delete button in the edit modal for a creator game with no recorded rounds', async () => {
        axios.get.mockResolvedValueOnce({
            data: { data: { games: gamesWithRoles } },
        });

        render(<GameCard onGameSelect={vi.fn()} />);

        const trigger = await screen.findByRole('combobox');
        await waitFor(() => expect(trigger).not.toBeDisabled());
        await userEvent.click(trigger);
        await userEvent.click(screen.getByRole('option', { name: 'My Game (2000 pts)' }));

        await userEvent.click(screen.getByRole('button', { name: 'Edit' }));

        expect(screen.getByText('Edit game')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    });

    it('does not show the Delete button in the edit modal for a viewer game', async () => {
        axios.get.mockResolvedValueOnce({
            data: { data: { games: gamesWithRoles } },
        });

        render(<GameCard onGameSelect={vi.fn()} />);

        const trigger = await screen.findByRole('combobox');
        await waitFor(() => expect(trigger).not.toBeDisabled());
        await userEvent.click(trigger);
        await userEvent.click(screen.getByRole('option', { name: 'Their Game (2000 pts)' }));

        await userEvent.click(screen.getByRole('button', { name: 'Edit' }));

        expect(screen.getByText('Edit game')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    });

    it('does not show the Delete button in the edit modal for a creator game with recorded rounds', async () => {
        const creatorGameWithRounds = [
            {
                id: 20,
                name: 'Ongoing Game',
                target_points: 2000,
                status: 'in_progress',
                winning_team_id: null,
                current_round_number: 3,
                user_role: 'creator',
            },
        ];

        axios.get.mockResolvedValueOnce({
            data: { data: { games: creatorGameWithRounds } },
        });

        render(<GameCard onGameSelect={vi.fn()} />);

        const trigger = await screen.findByRole('combobox');
        await waitFor(() => expect(trigger).not.toBeDisabled());
        await userEvent.click(trigger);
        await userEvent.click(screen.getByRole('option', { name: 'Ongoing Game (2000 pts)' }));

        await userEvent.click(screen.getByRole('button', { name: 'Edit' }));

        expect(screen.getByText('Edit game')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    });

    it('deletes the game, removes it from the list, and resets the selector on confirmation', async () => {
        vi.spyOn(window, 'confirm').mockReturnValue(true);

        axios.get.mockResolvedValueOnce({
            data: { data: { games: gamesWithRoles } },
        });

        axios.delete.mockResolvedValueOnce({
            data: { status: 'success', data: { game_id: 10 } },
        });

        render(<GameCard onGameSelect={vi.fn()} />);

        const trigger = await screen.findByRole('combobox');
        await waitFor(() => expect(trigger).not.toBeDisabled());
        await userEvent.click(trigger);
        await userEvent.click(screen.getByRole('option', { name: 'My Game (2000 pts)' }));

        await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
        await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

        await waitFor(() =>
            expect(axios.delete).toHaveBeenCalledWith('/api/v1/games/10'),
        );

        await waitFor(() =>
            expect(screen.queryByText('Edit game')).not.toBeInTheDocument(),
        );

        expect(trigger).toHaveTextContent('Select a game');

        await userEvent.click(trigger);
        expect(screen.queryByRole('option', { name: 'My Game (2000 pts)' })).not.toBeInTheDocument();

        vi.restoreAllMocks();
    });

    it('shows a general error when the delete request fails', async () => {
        vi.spyOn(window, 'confirm').mockReturnValue(true);

        axios.get.mockResolvedValueOnce({
            data: { data: { games: gamesWithRoles } },
        });

        axios.delete.mockRejectedValueOnce(new Error('Server error'));

        render(<GameCard onGameSelect={vi.fn()} />);

        const trigger = await screen.findByRole('combobox');
        await waitFor(() => expect(trigger).not.toBeDisabled());
        await userEvent.click(trigger);
        await userEvent.click(screen.getByRole('option', { name: 'My Game (2000 pts)' }));

        await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
        await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

        await waitFor(() =>
            expect(screen.getByText('Unable to delete the game right now.')).toBeInTheDocument(),
        );

        expect(screen.getByText('Edit game')).toBeInTheDocument();

        vi.restoreAllMocks();
    });

    it('does not delete the game when the confirmation dialog is dismissed', async () => {
        vi.spyOn(window, 'confirm').mockReturnValue(false);

        axios.get.mockResolvedValueOnce({
            data: { data: { games: gamesWithRoles } },
        });

        render(<GameCard onGameSelect={vi.fn()} />);

        const trigger = await screen.findByRole('combobox');
        await waitFor(() => expect(trigger).not.toBeDisabled());
        await userEvent.click(trigger);
        await userEvent.click(screen.getByRole('option', { name: 'My Game (2000 pts)' }));

        await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
        await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

        expect(axios.delete).not.toHaveBeenCalled();
        expect(screen.getByText('Edit game')).toBeInTheDocument();

        vi.restoreAllMocks();
    });

    // -------------------------------------------------------------------------
    // preselectedGameId — auto-selection on mount
    // -------------------------------------------------------------------------

    it('auto-selects the game matching preselectedGameId after games load', async () => {
        const onGameSelect = vi.fn();

        axios.get.mockResolvedValueOnce({
            data: { data: { games: gamesWithRoles } },
        });

        render(<GameCard onGameSelect={onGameSelect} preselectedGameId="11" />);

        const trigger = await screen.findByRole('combobox');
        await waitFor(() => expect(trigger).toHaveTextContent(/Their Game/));
    });

    it('falls back to the placeholder when preselectedGameId does not match any game', async () => {
        const onGameSelect = vi.fn();

        axios.get.mockResolvedValueOnce({
            data: { data: { games: gamesWithRoles } },
        });

        render(<GameCard onGameSelect={onGameSelect} preselectedGameId="9999" />);

        const trigger = await screen.findByRole('combobox');
        await waitFor(() => expect(trigger).toHaveTextContent('Select a game'));
    });

    it('gives preselectedGameId priority over a stale localStorage entry', async () => {
        localStorage.setItem('burako_selected_game_id', '10');

        axios.get.mockResolvedValueOnce({
            data: { data: { games: gamesWithRoles } },
        });

        render(<GameCard onGameSelect={vi.fn()} preselectedGameId="11" />);

        const trigger = await screen.findByRole('combobox');
        await waitFor(() => expect(trigger).toHaveTextContent(/Their Game/));
    });

    it('auto-selects a pending_invitee game when preselectedGameId matches it', async () => {
        axios.get.mockResolvedValueOnce({
            data: { data: { games: gamesWithRoles } },
        });

        render(<GameCard onGameSelect={vi.fn()} preselectedGameId="12" />);

        const trigger = await screen.findByRole('combobox');
        await waitFor(() => expect(trigger).toHaveTextContent(/Pending Game/));
        expect(
            screen.getByRole('button', { name: 'Accept invitation to this game' }),
        ).toBeInTheDocument();
    });

    // -------------------------------------------------------------------------
    // pending_invitee — onGameSelect blocking
    // -------------------------------------------------------------------------

    it('does not forward a pending_invitee game to onGameSelect', async () => {
        const onGameSelect = vi.fn();

        axios.get.mockResolvedValueOnce({
            data: { data: { games: gamesWithRoles } },
        });

        render(<GameCard onGameSelect={onGameSelect} />);

        const trigger = await screen.findByRole('combobox');
        await waitFor(() => expect(trigger).not.toBeDisabled());
        await userEvent.click(trigger);
        await userEvent.click(screen.getByRole('option', { name: 'Pending Game (2000 pts)' }));

        await waitFor(() =>
            expect(onGameSelect).toHaveBeenLastCalledWith(null),
        );
    });

    it('forwards a viewer game to onGameSelect', async () => {
        const onGameSelect = vi.fn();

        axios.get.mockResolvedValueOnce({
            data: { data: { games: gamesWithRoles } },
        });

        render(<GameCard onGameSelect={onGameSelect} />);

        const trigger = await screen.findByRole('combobox');
        await waitFor(() => expect(trigger).not.toBeDisabled());
        await userEvent.click(trigger);
        await userEvent.click(screen.getByRole('option', { name: 'Their Game (2000 pts)' }));

        await waitFor(() =>
            expect(onGameSelect).toHaveBeenLastCalledWith(
                expect.objectContaining({ id: 11, user_role: 'viewer' }),
            ),
        );
    });

    // -------------------------------------------------------------------------
    // Accept Invite flow
    // -------------------------------------------------------------------------

    it('calls PUT /api/v1/games/:id/invitation when Accept Invite is clicked', async () => {
        const updatedGame = { ...gamesWithRoles[2], user_role: 'viewer' };

        axios.get.mockResolvedValueOnce({
            data: { data: { games: gamesWithRoles } },
        });

        axios.put.mockResolvedValueOnce({
            data: { data: { game: updatedGame } },
        });

        render(<GameCard onGameSelect={vi.fn()} />);

        const trigger = await screen.findByRole('combobox');
        await waitFor(() => expect(trigger).not.toBeDisabled());
        await userEvent.click(trigger);
        await userEvent.click(screen.getByRole('option', { name: 'Pending Game (2000 pts)' }));

        await userEvent.click(
            screen.getByRole('button', { name: 'Accept invitation to this game' }),
        );

        await waitFor(() =>
            expect(axios.put).toHaveBeenCalledWith('/api/v1/games/12/invitation'),
        );
    });

    it('promotes the game role to viewer and calls onGameSelect after accepting', async () => {
        const onGameSelect = vi.fn();
        const updatedGame = { ...gamesWithRoles[2], user_role: 'viewer' };

        axios.get.mockResolvedValueOnce({
            data: { data: { games: gamesWithRoles } },
        });

        axios.put.mockResolvedValueOnce({
            data: { data: { game: updatedGame } },
        });

        render(<GameCard onGameSelect={onGameSelect} />);

        const trigger = await screen.findByRole('combobox');
        await waitFor(() => expect(trigger).not.toBeDisabled());
        await userEvent.click(trigger);
        await userEvent.click(screen.getByRole('option', { name: 'Pending Game (2000 pts)' }));

        // Before accepting, onGameSelect received null (pending_invitee blocked)
        await waitFor(() =>
            expect(onGameSelect).toHaveBeenLastCalledWith(null),
        );

        await userEvent.click(
            screen.getByRole('button', { name: 'Accept invitation to this game' }),
        );

        // After accepting, onGameSelect receives the updated viewer game
        await waitFor(() =>
            expect(onGameSelect).toHaveBeenLastCalledWith(
                expect.objectContaining({ id: 12, user_role: 'viewer' }),
            ),
        );
    });

    it('hides the Accept Invite button and shows Viewer icon after accepting', async () => {
        const updatedGame = { ...gamesWithRoles[2], user_role: 'viewer' };

        axios.get.mockResolvedValueOnce({
            data: { data: { games: gamesWithRoles } },
        });

        axios.put.mockResolvedValueOnce({
            data: { data: { game: updatedGame } },
        });

        render(<GameCard onGameSelect={vi.fn()} />);

        const trigger = await screen.findByRole('combobox');
        await waitFor(() => expect(trigger).not.toBeDisabled());
        await userEvent.click(trigger);
        await userEvent.click(screen.getByRole('option', { name: 'Pending Game (2000 pts)' }));

        await userEvent.click(
            screen.getByRole('button', { name: 'Accept invitation to this game' }),
        );

        await waitFor(() =>
            expect(
                screen.queryByRole('button', { name: 'Accept invitation to this game' }),
            ).not.toBeInTheDocument(),
        );

        expect(screen.getByTitle('Viewer')).toBeInTheDocument();
    });

    it('disables the Accept Invite button while the request is in flight', async () => {
        axios.get.mockResolvedValueOnce({
            data: { data: { games: gamesWithRoles } },
        });

        // Never resolve so we can assert the disabled state
        axios.put.mockReturnValueOnce(new Promise(() => {}));

        render(<GameCard onGameSelect={vi.fn()} />);

        const trigger = await screen.findByRole('combobox');
        await waitFor(() => expect(trigger).not.toBeDisabled());
        await userEvent.click(trigger);
        await userEvent.click(screen.getByRole('option', { name: 'Pending Game (2000 pts)' }));

        const acceptBtn = screen.getByRole('button', { name: 'Accept invitation to this game' });
        await userEvent.click(acceptBtn);

        await waitFor(() =>
            expect(screen.getByRole('button', { name: 'Accept invitation to this game' })).toBeDisabled(),
        );
    });

    it('shows an error message when the accept invitation request fails', async () => {
        axios.get.mockResolvedValueOnce({
            data: { data: { games: gamesWithRoles } },
        });

        axios.put.mockRejectedValueOnce(new Error('Network Error'));

        render(<GameCard onGameSelect={vi.fn()} />);

        const trigger = await screen.findByRole('combobox');
        await waitFor(() => expect(trigger).not.toBeDisabled());
        await userEvent.click(trigger);
        await userEvent.click(screen.getByRole('option', { name: 'Pending Game (2000 pts)' }));

        await userEvent.click(
            screen.getByRole('button', { name: 'Accept invitation to this game' }),
        );

        await waitFor(() =>
            expect(
                screen.getByText('Unable to accept the invitation right now. Please try again.'),
            ).toBeInTheDocument(),
        );
    });

    it('clears the accept invite error when the user switches to another game', async () => {
        axios.get.mockResolvedValueOnce({
            data: { data: { games: gamesWithRoles } },
        });

        axios.put.mockRejectedValueOnce(new Error('Network Error'));

        render(<GameCard onGameSelect={vi.fn()} />);

        const trigger = await screen.findByRole('combobox');
        await waitFor(() => expect(trigger).not.toBeDisabled());
        await userEvent.click(trigger);
        await userEvent.click(screen.getByRole('option', { name: 'Pending Game (2000 pts)' }));

        await userEvent.click(
            screen.getByRole('button', { name: 'Accept invitation to this game' }),
        );

        await waitFor(() =>
            expect(
                screen.getByText('Unable to accept the invitation right now. Please try again.'),
            ).toBeInTheDocument(),
        );

        // Switch game
        await userEvent.click(trigger);
        await userEvent.click(screen.getByRole('option', { name: 'My Game (2000 pts)' }));

        await waitFor(() =>
            expect(
                screen.queryByText('Unable to accept the invitation right now. Please try again.'),
            ).not.toBeInTheDocument(),
        );
    });
});

