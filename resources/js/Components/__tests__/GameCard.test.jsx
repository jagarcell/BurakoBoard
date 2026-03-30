import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import api from '@/api/client';
import { usePage } from '@inertiajs/react';
import GameCard from '@/Components/GameCard';

vi.mock('@/api/client', () => ({
    default: {
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
    },
}));

vi.mock('@inertiajs/react', () => ({
    usePage: vi.fn(() => ({
        props: {
            auth: { user: { id: 1 } },
            hasPendingInvitations: false,
        },
    })),
}));

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
];

const pendingGame = {
    id: 12,
    name: 'Pending Game',
    target_points: 2000,
    status: 'in_progress',
    winning_team_id: null,
    current_round_number: 0,
    user_role: 'pending_invitee',
};

describe('GameCard', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.clearAllMocks();

        const channelStub = {
            listen: vi.fn().mockReturnThis(),
            stopListening: vi.fn().mockReturnThis(),
        };
        window.Echo = {
            private: vi.fn(() => channelStub),
            leave: vi.fn(),
        };

        usePage.mockReturnValue({
            props: {
                auth: { user: { id: 1 } },
                hasPendingInvitations: false,
            },
        });
    });

    afterEach(() => {
        delete window.Echo;
    });

    it('shows the Select or create a game placeholder and no auto-selection on load', async () => {
        const onGameSelect = vi.fn();

        api.get.mockResolvedValueOnce({
            data: { data: { games: twoGames } },
        });

        render(<GameCard onGameSelect={onGameSelect} />);

        const trigger = await screen.findByRole('combobox');
        await waitFor(() => expect(trigger).toHaveTextContent('Select or create a game'));

        expect(trigger).toHaveTextContent('Select or create a game');

        await waitFor(() =>
            expect(onGameSelect).toHaveBeenLastCalledWith(null),
        );
    });

    it('shows the New button when no game is selected and Edit button after selecting one', async () => {
        api.get.mockResolvedValueOnce({
            data: { data: { games: twoGames } },
        });

        render(<GameCard onGameSelect={vi.fn()} />);

        const trigger = await screen.findByRole('combobox');
        await waitFor(() => expect(trigger).not.toBeDisabled());
        expect(trigger).toHaveTextContent('Select or create a game');
        expect(screen.getByRole('button', { name: 'New' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();

        await userEvent.click(trigger);
        await userEvent.click(screen.getByRole('option', { name: 'Late Table (2000 pts)' }));

        expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'New' })).not.toBeInTheDocument();
    });

    it('shows the Edit button for a creator game and hides it for a viewer game', async () => {
        api.get.mockResolvedValueOnce({
            data: { data: { games: gamesWithRoles } },
        });

        render(<GameCard onGameSelect={vi.fn()} />);

        const trigger = await screen.findByRole('combobox');
        await waitFor(() => expect(trigger).not.toBeDisabled());

        // Select the creator game — Edit button should appear
        await userEvent.click(trigger);
        await userEvent.click(screen.getByRole('option', { name: /My Game/ }));
        expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();

        // Select the viewer game — Edit button should be hidden
        await userEvent.click(trigger);
        await userEvent.click(screen.getByRole('option', { name: /Their Game/ }));
        expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'New' })).not.toBeInTheDocument();
    });

    it('allows manual selection of a game from the dropdown', async () => {
        const onGameSelect = vi.fn();

        api.get.mockResolvedValueOnce({
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

        api.get.mockResolvedValueOnce({
            data: { data: { games: oneGame } },
        });

        api.post.mockResolvedValueOnce({
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
        await waitFor(() => expect(trigger).toHaveTextContent('Select or create a game'));

        await userEvent.click(screen.getByRole('button', { name: 'New' }));

        await userEvent.clear(screen.getByLabelText('Game name'));
        await userEvent.type(screen.getByLabelText('Game name'), 'Finals Table');
        await userEvent.clear(screen.getByLabelText('Winning score'));
        await userEvent.type(screen.getByLabelText('Winning score'), '3000');
        await userEvent.click(screen.getByRole('button', { name: 'Accept' }));

        await waitFor(() =>
            expect(api.post).toHaveBeenCalledWith('/games', {
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

        api.get.mockResolvedValueOnce({
            data: { data: { games: twoGames } },
        });

        api.put.mockResolvedValueOnce({
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
            expect(api.put).toHaveBeenCalledWith('/games/8', {
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
        api.get.mockResolvedValueOnce({
            data: { data: { games: twoGames } },
        });

        render(<GameCard onGameSelect={vi.fn()} />);

        const trigger = await screen.findByRole('combobox');
        await waitFor(() => expect(trigger).not.toBeDisabled());

        await userEvent.click(trigger);
        await userEvent.click(screen.getByRole('option', { name: 'Late Table (2000 pts)' }));
        expect(trigger).toHaveTextContent(/Late Table/);

        await userEvent.click(trigger);
        await userEvent.click(screen.getByRole('option', { name: 'Select or create a game' }));
        expect(trigger).toHaveTextContent('Select or create a game');
        expect(screen.getByRole('button', { name: 'New' })).toBeInTheDocument();
    });

    it('persists the selected game id to localStorage when a game is chosen', async () => {
        api.get.mockResolvedValueOnce({
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

        api.get.mockResolvedValueOnce({
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

        api.get.mockResolvedValueOnce({
            data: { data: { games: twoGames } },
        });

        render(<GameCard onGameSelect={onGameSelect} />);

        const trigger = await screen.findByRole('combobox');
        await waitFor(() => expect(trigger).toHaveTextContent('Select or create a game'));
        await waitFor(() =>
            expect(onGameSelect).toHaveBeenLastCalledWith(null),
        );
    });

    it('removes the localStorage entry when the placeholder is selected', async () => {
        localStorage.setItem('burako_selected_game_id', '8');

        api.get.mockResolvedValueOnce({
            data: { data: { games: twoGames } },
        });

        render(<GameCard onGameSelect={vi.fn()} />);

        const trigger = await screen.findByRole('combobox');
        await waitFor(() => expect(trigger).toHaveTextContent(/Late Table/));

        await userEvent.click(trigger);
        await userEvent.click(screen.getByRole('option', { name: 'Select or create a game' }));

        expect(localStorage.getItem('burako_selected_game_id')).toBeNull();
    });

    it('shows role icon badges in the open dropdown for creator and viewer', async () => {
        api.get.mockResolvedValueOnce({
            data: { data: { games: gamesWithRoles } },
        });

        render(<GameCard onGameSelect={vi.fn()} />);

        const trigger = await screen.findByRole('combobox');
        await waitFor(() => expect(trigger).not.toBeDisabled());
        await userEvent.click(trigger);

        expect(screen.getByTitle('Creator')).toBeInTheDocument();
        expect(screen.getByTitle('Viewer')).toBeInTheDocument();
        expect(screen.queryByTitle('Pending invite')).not.toBeInTheDocument();
    });

    it('shows the creator icon in the trigger after selecting a creator game', async () => {
        api.get.mockResolvedValueOnce({
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
        api.get.mockResolvedValueOnce({
            data: { data: { games: gamesWithRoles } },
        });

        render(<GameCard onGameSelect={vi.fn()} />);

        const trigger = await screen.findByRole('combobox');
        await waitFor(() => expect(trigger).not.toBeDisabled());
        await userEvent.click(trigger);
        await userEvent.click(screen.getByRole('option', { name: 'Their Game (2000 pts)' }));

        expect(screen.getByTitle('Viewer')).toBeInTheDocument();
    });

    it('shows the Invite Viewer button when a creator game is selected', async () => {
        api.get.mockResolvedValueOnce({
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
        api.get.mockResolvedValueOnce({
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
        api.get.mockResolvedValueOnce({
            data: { data: { games: gamesWithRoles } },
        });

        render(<GameCard onGameSelect={vi.fn()} />);

        await screen.findByRole('combobox');

        expect(
            screen.queryByRole('button', { name: 'Invite a viewer to this game' }),
        ).not.toBeInTheDocument();
    });

    // -------------------------------------------------------------------------
    // Bell notification icon
    // -------------------------------------------------------------------------

    it('shows the bell notification icon next to Game Hub when hasPendingInvitations is true', async () => {
        usePage.mockReturnValue({
            props: {
                auth: { user: { id: 1 } },
                hasPendingInvitations: true,
            },
        });

        api.get.mockResolvedValueOnce({
            data: { data: { games: gamesWithRoles } },
        });

        render(<GameCard onGameSelect={vi.fn()} />);

        await screen.findByRole('combobox');

        expect(
            screen.getByTitle('You have pending game invitations'),
        ).toBeInTheDocument();
    });

    it('does not show the bell notification icon when hasPendingInvitations is false', async () => {
        api.get.mockResolvedValueOnce({
            data: { data: { games: gamesWithRoles } },
        });

        render(<GameCard onGameSelect={vi.fn()} />);

        await screen.findByRole('combobox');

        expect(
            screen.queryByTitle('You have pending game invitations'),
        ).not.toBeInTheDocument();
    });

    // -------------------------------------------------------------------------
    // Bell popup — pending invitations list
    // -------------------------------------------------------------------------

    it('opens an invitations popup with the pending game name when the bell is clicked', async () => {
        usePage.mockReturnValue({
            props: {
                auth: { user: { id: 1 } },
                hasPendingInvitations: true,
            },
        });

        api.get.mockResolvedValueOnce({
            data: { data: { games: gamesWithRoles } },
        });
        // Invitations fetch triggered on bell click.
        api.get.mockResolvedValueOnce({
            data: { data: { invitations: [pendingGame] } },
        });

        render(<GameCard onGameSelect={vi.fn()} />);

        await screen.findByRole('combobox');
        await waitFor(() =>
            expect(screen.getByTitle('You have pending game invitations')).toBeInTheDocument(),
        );

        await userEvent.click(screen.getByRole('button', { name: 'Pending game invitations' }));

        expect(screen.getByRole('dialog', { name: 'Game invitations' })).toBeInTheDocument();
        await waitFor(() => expect(screen.getByText('Pending Game')).toBeInTheDocument());
    });

    it('calls GET /api/v1/invitations when the bell is clicked to open the popup', async () => {
        usePage.mockReturnValue({
            props: {
                auth: { user: { id: 1 } },
                hasPendingInvitations: true,
            },
        });

        api.get.mockResolvedValueOnce({
            data: { data: { games: gamesWithRoles } },
        });
        api.get.mockResolvedValueOnce({
            data: { data: { invitations: [pendingGame] } },
        });

        render(<GameCard onGameSelect={vi.fn()} />);

        await screen.findByRole('combobox');

        await userEvent.click(screen.getByRole('button', { name: 'Pending game invitations' }));

        await waitFor(() =>
            expect(api.get).toHaveBeenCalledWith('/invitations'),
        );
    });

    it('does not call GET /api/v1/invitations when the bell is clicked to close the popup', async () => {
        usePage.mockReturnValue({
            props: {
                auth: { user: { id: 1 } },
                hasPendingInvitations: true,
            },
        });

        api.get.mockResolvedValueOnce({
            data: { data: { games: gamesWithRoles } },
        });
        api.get.mockResolvedValueOnce({
            data: { data: { invitations: [pendingGame] } },
        });

        render(<GameCard onGameSelect={vi.fn()} />);

        await screen.findByRole('combobox');

        const bell = screen.getByRole('button', { name: 'Pending game invitations' });

        // First click — open.
        await userEvent.click(bell);
        await waitFor(() => expect(api.get).toHaveBeenCalledWith('/invitations'));
        const callCount = api.get.mock.calls.length;

        // Second click — close (no new fetch).
        await userEvent.click(bell);
        expect(api.get.mock.calls.length).toBe(callCount);
    });

    it('shows a newly arrived pending game fetched from the API when the popup opens', async () => {
        usePage.mockReturnValue({
            props: {
                auth: { user: { id: 1 } },
                hasPendingInvitations: true,
            },
        });

        // Initial games list does NOT contain the new invitation (e.g. it arrived via Reverb
        // and only hasPending was set to true, but the game wasn't in the list yet).
        const newInvitation = {
            id: 99,
            name: 'Brand New Invite',
            target_points: 2000,
            status: 'in_progress',
            winning_team_id: null,
            current_round_number: 0,
            user_role: 'pending_invitee',
        };

        api.get.mockResolvedValueOnce({
            data: { data: { games: [gamesWithRoles[0], gamesWithRoles[1]] } }, // no pending game
        });
        api.get.mockResolvedValueOnce({
            data: { data: { invitations: [newInvitation] } },
        });

        render(<GameCard onGameSelect={vi.fn()} />);

        await screen.findByRole('combobox');

        await userEvent.click(screen.getByRole('button', { name: 'Pending game invitations' }));

        await waitFor(() => expect(screen.getByText('Brand New Invite')).toBeInTheDocument());
    });

    it('calls PUT /api/v1/games/:id/invitation when the bell popup Accept button is clicked', async () => {
        usePage.mockReturnValue({
            props: {
                auth: { user: { id: 1 } },
                hasPendingInvitations: true,
            },
        });

        const updatedGame = { ...pendingGame, user_role: 'viewer' };

        api.get.mockResolvedValueOnce({
            data: { data: { games: gamesWithRoles } },
        });
        api.get.mockResolvedValueOnce({
            data: { data: { invitations: [pendingGame] } },
        });

        api.put.mockResolvedValueOnce({
            data: { data: { game: updatedGame } },
        });

        render(<GameCard onGameSelect={vi.fn()} />);

        await screen.findByRole('combobox');
        await waitFor(() =>
            expect(screen.getByTitle('You have pending game invitations')).toBeInTheDocument(),
        );

        await userEvent.click(screen.getByRole('button', { name: 'Pending game invitations' }));
        await waitFor(() =>
            expect(screen.getByRole('button', { name: 'Accept invitation to Pending Game' })).toBeInTheDocument(),
        );
        await userEvent.click(
            screen.getByRole('button', { name: 'Accept invitation to Pending Game' }),
        );

        await waitFor(() =>
            expect(api.put).toHaveBeenCalledWith('/games/12/invitation'),
        );
    });

    it('clears the bell and closes the popup after accepting the only pending game via the popup', async () => {
        usePage.mockReturnValue({
            props: {
                auth: { user: { id: 1 } },
                hasPendingInvitations: true,
            },
        });

        const updatedGame = { ...pendingGame, user_role: 'viewer' };

        api.get.mockResolvedValueOnce({
            data: { data: { games: gamesWithRoles } },
        });
        api.get.mockResolvedValueOnce({
            data: { data: { invitations: [pendingGame] } },
        });

        api.put.mockResolvedValueOnce({
            data: { data: { game: updatedGame } },
        });

        render(<GameCard onGameSelect={vi.fn()} />);

        await screen.findByRole('combobox');
        await waitFor(() =>
            expect(screen.getByTitle('You have pending game invitations')).toBeInTheDocument(),
        );

        await userEvent.click(screen.getByRole('button', { name: 'Pending game invitations' }));
        await waitFor(() =>
            expect(screen.getByRole('button', { name: 'Accept invitation to Pending Game' })).toBeInTheDocument(),
        );
        await userEvent.click(
            screen.getByRole('button', { name: 'Accept invitation to Pending Game' }),
        );

        // Bell disappears because no more pending_invitee games remain.
        await waitFor(() =>
            expect(
                screen.queryByTitle('You have pending game invitations'),
            ).not.toBeInTheDocument(),
        );

        // Popup also dismissed.
        expect(screen.queryByRole('dialog', { name: 'Game invitations' })).not.toBeInTheDocument();
    });

    it('adds the accepted game to the dropdown and auto-selects it after accepting via the bell popup', async () => {
        usePage.mockReturnValue({
            props: {
                auth: { user: { id: 1 } },
                hasPendingInvitations: true,
            },
        });

        const updatedGame = { ...pendingGame, user_role: 'viewer' };

        api.get.mockResolvedValueOnce({
            data: { data: { games: gamesWithRoles } },
        });
        api.get.mockResolvedValueOnce({
            data: { data: { invitations: [pendingGame] } },
        });
        api.put.mockResolvedValueOnce({
            data: { data: { game: updatedGame } },
        });

        const onGameSelect = vi.fn();
        render(<GameCard onGameSelect={onGameSelect} />);

        const trigger = await screen.findByRole('combobox');
        await waitFor(() =>
            expect(screen.getByTitle('You have pending game invitations')).toBeInTheDocument(),
        );

        await userEvent.click(screen.getByRole('button', { name: 'Pending game invitations' }));
        await waitFor(() =>
            expect(screen.getByRole('button', { name: 'Accept invitation to Pending Game' })).toBeInTheDocument(),
        );
        await userEvent.click(
            screen.getByRole('button', { name: 'Accept invitation to Pending Game' }),
        );

        // The accepted game is added to the dropdown and auto-selected.
        await waitFor(() => expect(trigger).toHaveTextContent(/Pending Game/));

        await waitFor(() =>
            expect(onGameSelect).toHaveBeenLastCalledWith(
                expect.objectContaining({ id: 12, user_role: 'viewer' }),
            ),
        );
    });

    // -------------------------------------------------------------------------
    // Invite Viewer modal
    // -------------------------------------------------------------------------

    it('opens the invite modal and shows a loading spinner when Invite Viewer is clicked', async () => {
        api.get.mockResolvedValueOnce({
            data: { data: { games: gamesWithRoles } },
        });

        // Delay the invitable-users response so the spinner is visible
        api.get.mockReturnValueOnce(new Promise(() => {}));

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
        api.get.mockResolvedValueOnce({
            data: { data: { games: gamesWithRoles } },
        });

        api.get.mockResolvedValueOnce({
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

        const aliceCheckbox = screen.getByRole('checkbox', { name: 'Alice' });
        const bobCheckbox = screen.getByRole('checkbox', { name: 'Bob' });
        expect(aliceCheckbox).not.toBeChecked();
        expect(bobCheckbox).not.toBeChecked();
    });

    it('fetches invitable users from the correct game endpoint when the modal opens', async () => {
        api.get.mockResolvedValueOnce({
            data: { data: { games: gamesWithRoles } },
        });

        api.get.mockResolvedValueOnce({
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
            expect(api.get).toHaveBeenCalledWith(
                '/games/10/invitable-users',
                expect.objectContaining({ params: { page: 1 } }),
            ),
        );
    });

    it('toggles a user checkbox on and off when clicked', async () => {
        api.get.mockResolvedValueOnce({
            data: { data: { games: gamesWithRoles } },
        });

        api.get.mockResolvedValueOnce({
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

        const checkbox = await screen.findByRole('checkbox', { name: 'Alice' });
        expect(checkbox).not.toBeChecked();

        await userEvent.click(checkbox);
        expect(checkbox).toBeChecked();

        await userEvent.click(checkbox);
        expect(checkbox).not.toBeChecked();
    });

    it('shows an empty state message when there are no invitable users', async () => {
        api.get.mockResolvedValueOnce({
            data: { data: { games: gamesWithRoles } },
        });

        api.get.mockResolvedValueOnce({
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
        api.get.mockResolvedValueOnce({
            data: { data: { games: gamesWithRoles } },
        });

        api.get.mockRejectedValueOnce(new Error('Network Error'));

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
        api.get.mockResolvedValueOnce({
            data: { data: { games: gamesWithRoles } },
        });

        api.get.mockResolvedValueOnce({
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
        api.get.mockResolvedValueOnce({
            data: { data: { games: gamesWithRoles } },
        });

        // Page 1
        api.get.mockResolvedValueOnce({
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
        api.get.mockResolvedValueOnce({
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
        api.get.mockResolvedValueOnce({
            data: { data: { games: gamesWithRoles } },
        });

        api.get.mockResolvedValueOnce({
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
        api.get.mockResolvedValueOnce({
            data: { data: { games: gamesWithRoles } },
        });

        api.get.mockResolvedValueOnce({
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
        api.get.mockResolvedValueOnce({
            data: { data: { games: gamesWithRoles } },
        });

        api.get.mockResolvedValueOnce({
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
        api.get.mockResolvedValueOnce({
            data: { data: { games: gamesWithRoles } },
        });

        api.get.mockResolvedValueOnce({
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

        await userEvent.click(screen.getByRole('checkbox', { name: 'Alice' }));

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

        api.get.mockResolvedValueOnce({ data: { data: { games: gamesWithRoles } } });
        api.get.mockResolvedValueOnce(usersResponse);
        // The refreshed user list after send (both users now invited, list is empty)
        api.get.mockResolvedValueOnce({
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

        api.post.mockResolvedValueOnce({
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
        await userEvent.click(screen.getByRole('checkbox', { name: 'Alice' }));

        await userEvent.click(screen.getByRole('button', { name: 'Send' }));

        await waitFor(() =>
            expect(api.post).toHaveBeenCalledWith(
                '/games/10/invitations',
                { user_ids: [101] },
            ),
        );

        await waitFor(() =>
            expect(screen.getByText('1 invitation sent successfully.')).toBeInTheDocument(),
        );
    });

    it('shows an error message when the send invitations request fails', async () => {
        api.get.mockResolvedValueOnce({ data: { data: { games: gamesWithRoles } } });
        api.get.mockResolvedValueOnce({
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

        api.post.mockRejectedValueOnce(new Error('Network Error'));

        render(<GameCard onGameSelect={vi.fn()} />);

        const trigger = await screen.findByRole('combobox');
        await waitFor(() => expect(trigger).not.toBeDisabled());
        await userEvent.click(trigger);
        await userEvent.click(screen.getByRole('option', { name: 'My Game (2000 pts)' }));

        await userEvent.click(
            screen.getByRole('button', { name: 'Invite a viewer to this game' }),
        );

        await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument());

        await userEvent.click(screen.getByRole('checkbox', { name: 'Alice' }));
        await userEvent.click(screen.getByRole('button', { name: 'Send' }));

        await waitFor(() =>
            expect(
                screen.getByText('Unable to send invitations right now. Please try again.'),
            ).toBeInTheDocument(),
        );
    });

    it('resets selections and refreshes the user list after a successful send', async () => {
        api.get.mockResolvedValueOnce({ data: { data: { games: gamesWithRoles } } });
        api.get.mockResolvedValueOnce({
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
        api.get.mockResolvedValueOnce({
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

        api.post.mockResolvedValueOnce({
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

        await userEvent.click(screen.getByRole('checkbox', { name: 'Alice' }));
        expect(screen.getByRole('button', { name: 'Send' })).not.toBeDisabled();

        await userEvent.click(screen.getByRole('button', { name: 'Send' }));

        await waitFor(() =>
            expect(screen.getByText('No users available to invite.')).toBeInTheDocument(),
        );

        // Send button should be disabled again since selection is cleared and no users are shown
        expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    });

    it('shows the Delete button in the edit modal for a creator game with no recorded rounds', async () => {
        api.get.mockResolvedValueOnce({
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

    it('does not show the Edit button or Delete button for a viewer game', async () => {
        api.get.mockResolvedValueOnce({
            data: { data: { games: gamesWithRoles } },
        });

        render(<GameCard onGameSelect={vi.fn()} />);

        const trigger = await screen.findByRole('combobox');
        await waitFor(() => expect(trigger).not.toBeDisabled());
        await userEvent.click(trigger);
        await userEvent.click(screen.getByRole('option', { name: 'Their Game (2000 pts)' }));

        expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
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

        api.get.mockResolvedValueOnce({
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

        api.get.mockResolvedValueOnce({
            data: { data: { games: gamesWithRoles } },
        });

        api.delete.mockResolvedValueOnce({
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
            expect(api.delete).toHaveBeenCalledWith('/games/10'),
        );

        await waitFor(() =>
            expect(screen.queryByText('Edit game')).not.toBeInTheDocument(),
        );

        expect(trigger).toHaveTextContent('Select or create a game');

        await userEvent.click(trigger);
        expect(screen.queryByRole('option', { name: 'My Game (2000 pts)' })).not.toBeInTheDocument();

        vi.restoreAllMocks();
    });

    it('shows a general error when the delete request fails', async () => {
        vi.spyOn(window, 'confirm').mockReturnValue(true);

        api.get.mockResolvedValueOnce({
            data: { data: { games: gamesWithRoles } },
        });

        api.delete.mockRejectedValueOnce(new Error('Server error'));

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

        api.get.mockResolvedValueOnce({
            data: { data: { games: gamesWithRoles } },
        });

        render(<GameCard onGameSelect={vi.fn()} />);

        const trigger = await screen.findByRole('combobox');
        await waitFor(() => expect(trigger).not.toBeDisabled());
        await userEvent.click(trigger);
        await userEvent.click(screen.getByRole('option', { name: 'My Game (2000 pts)' }));

        await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
        await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

        expect(api.delete).not.toHaveBeenCalled();
        expect(screen.getByText('Edit game')).toBeInTheDocument();

        vi.restoreAllMocks();
    });

    // -------------------------------------------------------------------------
    // preselectedGameId — auto-selection on mount
    // -------------------------------------------------------------------------

    it('auto-selects the game matching preselectedGameId after games load', async () => {
        const onGameSelect = vi.fn();

        api.get.mockResolvedValueOnce({
            data: { data: { games: gamesWithRoles } },
        });

        render(<GameCard onGameSelect={onGameSelect} preselectedGameId="11" />);

        const trigger = await screen.findByRole('combobox');
        await waitFor(() => expect(trigger).toHaveTextContent(/Their Game/));
    });

    it('falls back to the placeholder when preselectedGameId does not match any game', async () => {
        const onGameSelect = vi.fn();

        api.get.mockResolvedValueOnce({
            data: { data: { games: gamesWithRoles } },
        });

        render(<GameCard onGameSelect={onGameSelect} preselectedGameId="9999" />);

        const trigger = await screen.findByRole('combobox');
        await waitFor(() => expect(trigger).toHaveTextContent('Select or create a game'));
    });

    it('gives preselectedGameId priority over a stale localStorage entry', async () => {
        localStorage.setItem('burako_selected_game_id', '10');

        api.get.mockResolvedValueOnce({
            data: { data: { games: gamesWithRoles } },
        });

        render(<GameCard onGameSelect={vi.fn()} preselectedGameId="11" />);

        const trigger = await screen.findByRole('combobox');
        await waitFor(() => expect(trigger).toHaveTextContent(/Their Game/));
    });

    // -------------------------------------------------------------------------
    // pending_invitee — onGameSelect forwarding
    // -------------------------------------------------------------------------

    it('forwards a viewer game to onGameSelect', async () => {
        const onGameSelect = vi.fn();

        api.get.mockResolvedValueOnce({
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
    // Include finished games filter
    // -------------------------------------------------------------------------

    it('renders the Include finished games checkbox checked by default', async () => {
        api.get.mockResolvedValueOnce({
            data: { data: { games: twoGames } },
        });

        render(<GameCard onGameSelect={vi.fn()} />);

        const filterCheckbox = await screen.findByRole('checkbox', { name: 'Include finished games' });
        expect(filterCheckbox).toBeChecked();
    });

    it('shows all games (including finished) in the dropdown when the filter checkbox is checked', async () => {
        api.get.mockResolvedValueOnce({
            data: { data: { games: twoGames } },
        });

        render(<GameCard onGameSelect={vi.fn()} />);

        const trigger = await screen.findByRole('combobox');
        await waitFor(() => expect(trigger).not.toBeDisabled());
        await userEvent.click(trigger);

        expect(screen.getByRole('option', { name: 'Late Table (2000 pts)' })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: 'Early Table (1500 pts)' })).toBeInTheDocument();
    });

    it('hides finished games from the dropdown when the filter checkbox is unchecked', async () => {
        api.get.mockResolvedValueOnce({
            data: { data: { games: twoGames } },
        });

        render(<GameCard onGameSelect={vi.fn()} />);

        const filterCheckbox = await screen.findByRole('checkbox', { name: 'Include finished games' });
        await userEvent.click(filterCheckbox);

        const trigger = screen.getByRole('combobox');
        await waitFor(() => expect(trigger).not.toBeDisabled());
        await userEvent.click(trigger);

        expect(screen.getByRole('option', { name: 'Late Table (2000 pts)' })).toBeInTheDocument();
        expect(screen.queryByRole('option', { name: 'Early Table (1500 pts)' })).not.toBeInTheDocument();
    });

    it('persists the Include finished games preference to localStorage keyed by user id', async () => {
        api.get.mockResolvedValueOnce({
            data: { data: { games: twoGames } },
        });

        render(<GameCard onGameSelect={vi.fn()} />);

        const filterCheckbox = await screen.findByRole('checkbox', { name: 'Include finished games' });

        await userEvent.click(filterCheckbox);
        expect(localStorage.getItem('burako_include_finished_1')).toBe('false');

        await userEvent.click(filterCheckbox);
        expect(localStorage.getItem('burako_include_finished_1')).toBe('true');
    });

    it('restores the Include finished games preference from localStorage on mount', async () => {
        localStorage.setItem('burako_include_finished_1', 'false');

        api.get.mockResolvedValueOnce({
            data: { data: { games: twoGames } },
        });

        render(<GameCard onGameSelect={vi.fn()} />);

        const filterCheckbox = await screen.findByRole('checkbox', { name: 'Include finished games' });
        expect(filterCheckbox).not.toBeChecked();
    });

    // Rematch button tests
    it('does not show Rematch button when no game is selected', async () => {
        api.get.mockResolvedValueOnce({ data: { data: { games: [] } } });

        render(<GameCard onGameSelect={vi.fn()} />);

        await screen.findByText(/loading games/i);

        expect(screen.queryByRole('button', { name: /start a rematch/i })).not.toBeInTheDocument();
    });

    it('does not show Rematch button when selected game is in_progress', async () => {
        const inProgressCreatorGame = [{
            id: 20,
            name: 'Active Game',
            target_points: 2000,
            status: 'in_progress',
            winning_team_id: null,
            current_round_number: 0,
            user_role: 'creator',
        }];

        api.get.mockResolvedValueOnce({ data: { data: { games: inProgressCreatorGame } } });
        localStorage.setItem('burako_selected_game_id', '20');

        render(<GameCard onGameSelect={vi.fn()} />);

        await screen.findByRole('combobox');

        expect(screen.queryByRole('button', { name: /start a rematch/i })).not.toBeInTheDocument();
    });

    it('does not show Rematch button when finished game belongs to viewer', async () => {
        const finishedViewerGame = [{
            id: 21,
            name: 'Finished Viewer Game',
            target_points: 2000,
            status: 'finished',
            winning_team_id: 1,
            current_round_number: 5,
            user_role: 'viewer',
        }];

        api.get.mockResolvedValueOnce({ data: { data: { games: finishedViewerGame } } });
        localStorage.setItem('burako_selected_game_id', '21');

        render(<GameCard onGameSelect={vi.fn()} />);

        await screen.findByRole('combobox');

        expect(screen.queryByRole('button', { name: /start a rematch/i })).not.toBeInTheDocument();
    });

    it('shows Rematch button when creator selects a finished game', async () => {
        const finishedCreatorGame = [{
            id: 22,
            name: 'Finished Creator Game',
            target_points: 2000,
            status: 'finished',
            winning_team_id: 1,
            current_round_number: 4,
            user_role: 'creator',
        }];

        api.get.mockResolvedValueOnce({ data: { data: { games: finishedCreatorGame } } });
        localStorage.setItem('burako_selected_game_id', '22');

        render(<GameCard onGameSelect={vi.fn()} />);

        await screen.findByRole('button', { name: /start a rematch/i });
    });

    it('shows Rematch button but not Invite Viewer button on a finished creator game', async () => {
        const finishedCreatorGame = [{
            id: 23,
            name: 'Finished Game',
            target_points: 2000,
            status: 'finished',
            winning_team_id: 1,
            current_round_number: 4,
            user_role: 'creator',
        }];

        api.get.mockResolvedValueOnce({ data: { data: { games: finishedCreatorGame } } });
        localStorage.setItem('burako_selected_game_id', '23');

        render(<GameCard onGameSelect={vi.fn()} />);

        await screen.findByRole('button', { name: /start a rematch/i });

        expect(screen.queryByRole('button', { name: /invite a viewer/i })).not.toBeInTheDocument();
    });

    it('shows Invite Viewer button but not Rematch button on an in-progress creator game', async () => {
        const inProgressCreatorGame = [{
            id: 24,
            name: 'In Progress Game',
            target_points: 2000,
            status: 'in_progress',
            winning_team_id: null,
            current_round_number: 0,
            user_role: 'creator',
        }];

        api.get.mockResolvedValueOnce({ data: { data: { games: inProgressCreatorGame } } });
        localStorage.setItem('burako_selected_game_id', '24');

        render(<GameCard onGameSelect={vi.fn()} />);

        await screen.findByRole('button', { name: /invite a viewer/i });

        expect(screen.queryByRole('button', { name: /start a rematch/i })).not.toBeInTheDocument();
    });

    it('does not show Rematch button when finished creator game already has a rematch', async () => {
        const finishedGameWithRematch = [{
            id: 27,
            name: 'Already Rematched Game',
            target_points: 2000,
            status: 'finished',
            winning_team_id: 1,
            current_round_number: 4,
            user_role: 'creator',
            has_rematch: true,
        }];

        api.get.mockResolvedValueOnce({ data: { data: { games: finishedGameWithRematch } } });
        localStorage.setItem('burako_selected_game_id', '27');

        render(<GameCard onGameSelect={vi.fn()} />);

        await screen.findByRole('combobox');

        expect(screen.queryByRole('button', { name: /start a rematch/i })).not.toBeInTheDocument();
    });

    it('opens the rematch modal with pre-populated name and target points', async () => {
        const finishedCreatorGame = [{
            id: 25,
            name: 'Friday Burako',
            target_points: 2000,
            status: 'finished',
            winning_team_id: 1,
            current_round_number: 3,
            user_role: 'creator',
        }];

        api.get.mockResolvedValueOnce({ data: { data: { games: finishedCreatorGame } } });
        localStorage.setItem('burako_selected_game_id', '25');

        render(<GameCard onGameSelect={vi.fn()} />);

        const rematchBtn = await screen.findByRole('button', { name: /start a rematch/i });
        await userEvent.click(rematchBtn);

        expect(screen.getByRole('heading', { name: /start a rematch/i })).toBeInTheDocument();
        expect(screen.getByLabelText('Game name').value).toMatch(/^\w+ \d{4}\/\d{2}\/\d{2} \d{2}:\d{2}$/);
        expect(screen.getByDisplayValue('2000')).toBeInTheDocument();
    });

    it('calls the rematch API endpoint when the modal form is submitted', async () => {
        const finishedCreatorGame = [{
            id: 26,
            name: 'Friday Burako',
            target_points: 2000,
            status: 'finished',
            winning_team_id: 1,
            current_round_number: 3,
            user_role: 'creator',
        }];

        const createdGame = {
            id: 99,
            name: 'Friday Burako',
            target_points: 2000,
            status: 'in_progress',
            winning_team_id: null,
            current_round_number: 0,
        };

        api.get.mockResolvedValueOnce({ data: { data: { games: finishedCreatorGame } } });
        api.post.mockResolvedValueOnce({
            data: { data: { game: { game: createdGame, teams: [], rounds: [], round_roles: [] } } },
        });

        localStorage.setItem('burako_selected_game_id', '26');

        render(<GameCard onGameSelect={vi.fn()} />);

        const rematchBtn = await screen.findByRole('button', { name: /start a rematch/i });
        await userEvent.click(rematchBtn);

        const submitBtn = screen.getByRole('button', { name: /start rematch/i });
        await userEvent.click(submitBtn);

        expect(api.post).toHaveBeenCalledWith(
            '/games/26/rematch',
            { name: expect.stringMatching(/^\w+ \d{4}\/\d{2}\/\d{2} \d{2}:\d{2}$/), target_points: 2000 },
        );
    });

    it('adds the new game to the list and selects it after a rematch', async () => {
        const finishedCreatorGame = [{
            id: 27,
            name: 'Old Game',
            target_points: 2000,
            status: 'finished',
            winning_team_id: 1,
            current_round_number: 2,
            user_role: 'creator',
        }];

        const createdGame = {
            id: 100,
            name: 'Old Game',
            target_points: 2000,
            status: 'in_progress',
            winning_team_id: null,
            current_round_number: 0,
        };

        api.get.mockResolvedValueOnce({ data: { data: { games: finishedCreatorGame } } });
        api.post.mockResolvedValueOnce({
            data: { data: { game: { game: createdGame, teams: [], rounds: [], round_roles: [] } } },
        });

        localStorage.setItem('burako_selected_game_id', '27');

        render(<GameCard onGameSelect={vi.fn()} />);

        const rematchBtn = await screen.findByRole('button', { name: /start a rematch/i });
        await userEvent.click(rematchBtn);

        await userEvent.click(screen.getByRole('button', { name: /start rematch/i }));

        expect(localStorage.getItem('burako_selected_game_id')).toBe('100');
    });

    it('hides the Rematch button immediately after a rematch is created without a page refresh', async () => {
        const finishedCreatorGame = [{
            id: 28,
            name: 'Old Game',
            target_points: 2000,
            status: 'finished',
            winning_team_id: 1,
            current_round_number: 2,
            user_role: 'creator',
            has_rematch: false,
        }];

        const createdGame = {
            id: 101,
            name: 'Old Game Rematch',
            target_points: 2000,
            status: 'in_progress',
            winning_team_id: null,
            current_round_number: 0,
        };

        api.get.mockResolvedValueOnce({ data: { data: { games: finishedCreatorGame } } });
        api.post.mockResolvedValueOnce({
            data: { data: { game: { game: createdGame, teams: [], rounds: [], round_roles: [] } } },
        });

        localStorage.setItem('burako_selected_game_id', '28');

        render(<GameCard onGameSelect={vi.fn()} />);

        const rematchBtn = await screen.findByRole('button', { name: /start a rematch/i });
        await userEvent.click(rematchBtn);

        await userEvent.click(screen.getByRole('button', { name: /start rematch/i }));

        // The Rematch button must be gone immediately — no page refresh required.
        await waitFor(() =>
            expect(screen.queryByRole('button', { name: /start a rematch/i })).not.toBeInTheDocument(),
        );
    });

    // -------------------------------------------------------------------------
    // Invitation popup — real-time arrival banner
    // -------------------------------------------------------------------------

    it('shows the invitation popup when a real-time invitation event arrives', async () => {
        let capturedCallback = null;
        const channelStub = {
            listen: vi.fn((_event, cb) => { capturedCallback = cb; return channelStub; }),
            stopListening: vi.fn().mockReturnThis(),
        };
        window.Echo = {
            private: vi.fn(() => channelStub),
            leave: vi.fn(),
        };

        api.get.mockResolvedValueOnce({ data: { data: { games: gamesWithRoles } } });
        // fetchPendingInvitations called inside handleNewInvitation
        api.get.mockResolvedValueOnce({ data: { data: { invitations: [pendingGame] } } });

        render(<GameCard onGameSelect={vi.fn()} />);
        await screen.findByRole('combobox');

        // Fire the real-time event from Reverb
        await act(async () => {
            capturedCallback?.({ game_id: pendingGame.id });
        });

        await waitFor(() =>
            expect(screen.getByRole('dialog', { name: 'New game invitation' })).toBeInTheDocument(),
        );
        expect(screen.getByText('Pending Game')).toBeInTheDocument();
    });

    it('closes the invitation popup when the × button is clicked', async () => {
        let capturedCallback = null;
        const channelStub = {
            listen: vi.fn((_event, cb) => { capturedCallback = cb; return channelStub; }),
            stopListening: vi.fn().mockReturnThis(),
        };
        window.Echo = {
            private: vi.fn(() => channelStub),
            leave: vi.fn(),
        };

        api.get.mockResolvedValueOnce({ data: { data: { games: gamesWithRoles } } });
        api.get.mockResolvedValueOnce({ data: { data: { invitations: [pendingGame] } } });

        render(<GameCard onGameSelect={vi.fn()} />);
        await screen.findByRole('combobox');

        await act(async () => { capturedCallback?.({ game_id: pendingGame.id }); });

        await waitFor(() =>
            expect(screen.getByRole('dialog', { name: 'New game invitation' })).toBeInTheDocument(),
        );

        await userEvent.click(screen.getByRole('button', { name: 'Close invitation popup' }));

        await waitFor(() =>
            expect(screen.queryByRole('dialog', { name: 'New game invitation' })).not.toBeInTheDocument(),
        );
    });

    it('auto-closes the invitation popup after the invitation is accepted', async () => {
        let capturedCallback = null;
        const channelStub = {
            listen: vi.fn((_event, cb) => { capturedCallback = cb; return channelStub; }),
            stopListening: vi.fn().mockReturnThis(),
        };
        window.Echo = {
            private: vi.fn(() => channelStub),
            leave: vi.fn(),
        };

        const updatedGame = { ...pendingGame, user_role: 'viewer' };

        api.get.mockResolvedValueOnce({ data: { data: { games: gamesWithRoles } } });
        api.get.mockResolvedValueOnce({ data: { data: { invitations: [pendingGame] } } });
        api.put.mockResolvedValueOnce({ data: { data: { game: updatedGame } } });

        render(<GameCard onGameSelect={vi.fn()} />);
        await screen.findByRole('combobox');

        await act(async () => { capturedCallback?.({ game_id: pendingGame.id }); });

        await waitFor(() =>
            expect(screen.getByRole('dialog', { name: 'New game invitation' })).toBeInTheDocument(),
        );

        await userEvent.click(
            screen.getByRole('button', { name: `Accept invitation to ${pendingGame.name}` }),
        );

        await waitFor(() =>
            expect(screen.queryByRole('dialog', { name: 'New game invitation' })).not.toBeInTheDocument(),
        );
    });

    // -------------------------------------------------------------------------
    // Real-time game deletion — .game.deleted Echo event
    // -------------------------------------------------------------------------

    it('resets the dropdown to the placeholder when the selected game is deleted by another user', async () => {
        let capturedCallbacks = {};
        const channelStub = {
            listen: vi.fn((event, cb) => { capturedCallbacks[event] = cb; return channelStub; }),
            stopListening: vi.fn().mockReturnThis(),
        };
        window.Echo = {
            private: vi.fn(() => channelStub),
            leave: vi.fn(),
        };

        const onGameSelect = vi.fn();

        api.get.mockResolvedValueOnce({
            data: { data: { games: gamesWithRoles } },
        });

        render(<GameCard onGameSelect={onGameSelect} />);

        const trigger = await screen.findByRole('combobox');
        await waitFor(() => expect(trigger).not.toBeDisabled());

        // Select the creator game
        await userEvent.click(trigger);
        await userEvent.click(screen.getByRole('option', { name: 'My Game (2000 pts)' }));
        await waitFor(() => expect(trigger).toHaveTextContent(/My Game/));

        // Simulate the server broadcasting .game.deleted
        await act(async () => {
            capturedCallbacks['.game.deleted']?.({ game_id: 10 });
        });

        // Dropdown should reset to placeholder
        await waitFor(() => expect(trigger).toHaveTextContent('Select or create a game'));

        // The game is removed from the list
        await userEvent.click(trigger);
        expect(screen.queryByRole('option', { name: 'My Game (2000 pts)' })).not.toBeInTheDocument();

        // onGameSelect must have been called with null
        await waitFor(() =>
            expect(onGameSelect).toHaveBeenLastCalledWith(null),
        );
    });

    it('resets the dropdown to placeholder for a viewer when the game owner deletes it', async () => {
        let capturedCallbacks = {};
        const channelStub = {
            listen: vi.fn((event, cb) => { capturedCallbacks[event] = cb; return channelStub; }),
            stopListening: vi.fn().mockReturnThis(),
        };
        window.Echo = {
            private: vi.fn(() => channelStub),
            leave: vi.fn(),
        };

        api.get.mockResolvedValueOnce({
            data: { data: { games: gamesWithRoles } },
        });

        render(<GameCard onGameSelect={vi.fn()} />);

        const trigger = await screen.findByRole('combobox');
        await waitFor(() => expect(trigger).not.toBeDisabled());

        // Select the viewer game
        await userEvent.click(trigger);
        await userEvent.click(screen.getByRole('option', { name: 'Their Game (2000 pts)' }));
        await waitFor(() => expect(trigger).toHaveTextContent(/Their Game/));

        // Simulate .game.deleted broadcast for the viewer's selected game
        await act(async () => {
            capturedCallbacks['.game.deleted']?.({ game_id: 11 });
        });

        await waitFor(() => expect(trigger).toHaveTextContent('Select or create a game'));

        await userEvent.click(trigger);
        expect(screen.queryByRole('option', { name: 'Their Game (2000 pts)' })).not.toBeInTheDocument();
    });

    it('does not set up a game channel subscription when no game is selected', async () => {
        const channelStub = {
            listen: vi.fn().mockReturnThis(),
            stopListening: vi.fn().mockReturnThis(),
        };
        window.Echo = {
            private: vi.fn(() => channelStub),
            leave: vi.fn(),
        };

        api.get.mockResolvedValueOnce({
            data: { data: { games: gamesWithRoles } },
        });

        render(<GameCard onGameSelect={vi.fn()} />);

        // Wait for games to load without selecting any game
        const trigger = await screen.findByRole('combobox');
        await waitFor(() => expect(trigger).not.toBeDisabled());
        expect(trigger).toHaveTextContent('Select or create a game');

        // No private channel subscription for a game should have been opened
        const gameChannelCalls = window.Echo.private.mock.calls.filter(
            ([ch]) => ch.startsWith('game.'),
        );
        expect(gameChannelCalls).toHaveLength(0);
    });

    // -------------------------------------------------------------------------
    // selectedGameStatus prop — rematch button appears without page refresh
    // -------------------------------------------------------------------------

    it('shows the Rematch button immediately when selectedGameStatus transitions a creator game to finished', async () => {
        const inProgressCreatorGame = [{
            id: 50,
            name: 'Live Game',
            target_points: 2000,
            status: 'in_progress',
            winning_team_id: null,
            current_round_number: 0,
            user_role: 'creator',
            has_rematch: false,
        }];

        api.get.mockResolvedValueOnce({ data: { data: { games: inProgressCreatorGame } } });
        localStorage.setItem('burako_selected_game_id', '50');

        const { rerender } = render(
            <GameCard
                onGameSelect={vi.fn()}
                selectedGameStatus={{ id: 50, status: 'in_progress' }}
            />,
        );

        await screen.findByRole('button', { name: /invite a viewer/i });
        expect(screen.queryByRole('button', { name: /start a rematch/i })).not.toBeInTheDocument();

        // Simulate Dashboard pushing the 'finished' status (e.g. after recording the final round)
        rerender(
            <GameCard
                onGameSelect={vi.fn()}
                selectedGameStatus={{ id: 50, status: 'finished' }}
            />,
        );

        await screen.findByRole('button', { name: /start a rematch/i });
        expect(screen.queryByRole('button', { name: /invite a viewer/i })).not.toBeInTheDocument();
    });

});

