import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';
import TeamsCard from '@/Components/TeamsCard';

vi.mock('axios');

const mockUsers = [
    { id: 1, name: 'Alice' },
    { id: 2, name: 'Bob' },
];

const selectedGame = { id: 5, name: 'Friday Table', target_points: 2000 };

const makeGameSummary = (teams = []) => ({
    data: {
        data: {
            game: {
                game: { id: 5, name: 'Friday Table', target_points: 2000, status: 'in_progress' },
                teams,
                rounds: [],
            },
        },
    },
});

const makeTeam = (id, name, players = []) => ({
    id,
    name,
    current_score: 0,
    players,
});

const setupGetMocks = (teams = []) => {
    axios.get.mockImplementation((url) => {
        if (url === '/api/v1/users') {
            return Promise.resolve({ data: { data: { users: mockUsers } } });
        }

        if (/\/api\/v1\/games\/\d+$/.test(url)) {
            return Promise.resolve(makeGameSummary(teams));
        }

        return Promise.reject(new Error(`Unexpected GET: ${url}`));
    });
};

describe('TeamsCard', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });
    it('shows a placeholder when no game is selected', async () => {
        setupGetMocks();

        render(<TeamsCard selectedGame={null} />);

        expect(
            screen.getByText('Select a game above to manage its teams.'),
        ).toBeInTheDocument();
    });

    it('disables the Add team button when no game is selected', () => {
        setupGetMocks();

        render(<TeamsCard selectedGame={null} />);

        expect(screen.getByRole('button', { name: 'Add team' })).toBeDisabled();
    });

    it('enables the Add team button when a game with zero teams is selected', async () => {
        setupGetMocks([]);

        render(<TeamsCard selectedGame={selectedGame} />);

        await waitFor(() =>
            expect(screen.getByRole('button', { name: 'Add team' })).toBeEnabled(),
        );
    });

    it('enables the Add team button when a game with one team is selected', async () => {
        setupGetMocks([makeTeam(10, 'Team Alpha')]);

        render(<TeamsCard selectedGame={selectedGame} />);

        await waitFor(() =>
            expect(screen.getByRole('button', { name: 'Add team' })).toBeEnabled(),
        );
    });

    it('disables the Add team button when a game already has two teams', async () => {
        setupGetMocks([makeTeam(10, 'Team Alpha'), makeTeam(11, 'Team Beta')]);

        render(<TeamsCard selectedGame={selectedGame} />);

        await waitFor(() =>
            expect(screen.getByRole('button', { name: 'Add team' })).toBeDisabled(),
        );
    });

    it('renders existing teams and their players', async () => {
        const teams = [
            makeTeam(10, 'Team Alpha', [
                { id: 1, user_id: null, display_name: 'Carlos' },
            ]),
            makeTeam(11, 'Team Beta', []),
        ];

        setupGetMocks(teams);

        render(<TeamsCard selectedGame={selectedGame} />);

        await screen.findByText('Team Alpha');
        expect(screen.getByText('Carlos')).toBeInTheDocument();
        expect(screen.getByText('Team Beta')).toBeInTheDocument();
        expect(screen.getByText('No players yet.')).toBeInTheDocument();
    });

    it('shows registered users in the player dropdown after opening the modal', async () => {
        setupGetMocks([]);

        render(<TeamsCard selectedGame={selectedGame} />);

        await waitFor(() =>
            expect(screen.getByRole('button', { name: 'Add team' })).toBeEnabled(),
        );

        await userEvent.click(screen.getByRole('button', { name: 'Add team' }));

        expect(screen.getByText('Create a team')).toBeInTheDocument();

        const userSelect = screen.getByLabelText('Registered user (optional)');
        await waitFor(() =>
            expect(within(userSelect).getByRole('option', { name: 'Alice' })).toBeInTheDocument(),
        );
        expect(within(userSelect).getByRole('option', { name: 'Bob' })).toBeInTheDocument();
    });

    it('creates a team with a registered user player', async () => {
        setupGetMocks([]);

        const createdTeam = makeTeam(20, 'Team Alpha', [
            { id: 5, user_id: 1, display_name: 'Alice' },
        ]);

        axios.post
            .mockResolvedValueOnce(makeGameSummary([createdTeam]))
            .mockResolvedValueOnce(makeGameSummary([createdTeam]));

        render(<TeamsCard selectedGame={selectedGame} />);

        await waitFor(() =>
            expect(screen.getByRole('button', { name: 'Add team' })).toBeEnabled(),
        );

        await userEvent.click(screen.getByRole('button', { name: 'Add team' }));

        await userEvent.type(screen.getByLabelText('Team name'), 'Team Alpha');

        const userSelect = screen.getByLabelText('Registered user (optional)');
        await waitFor(() =>
            expect(within(userSelect).getByRole('option', { name: 'Alice' })).toBeInTheDocument(),
        );
        await userEvent.selectOptions(userSelect, '1');

        expect(screen.getByLabelText('Player name')).toHaveValue('Alice');

        await userEvent.click(screen.getByRole('button', { name: 'Add player' }));

        expect(screen.getAllByText('Alice').length).toBeGreaterThanOrEqual(2);

        await userEvent.click(screen.getByRole('button', { name: 'Create team' }));

        await waitFor(() =>
            expect(axios.post).toHaveBeenCalledWith(
                '/api/v1/games/5/teams',
                { name: 'Team Alpha' },
            ),
        );

        await waitFor(() =>
            expect(axios.post).toHaveBeenCalledWith(
                '/api/v1/games/5/teams/20/players',
                { user_id: 1, name: 'Alice' },
            ),
        );

        await waitFor(() =>
            expect(screen.queryByText('Create a team')).not.toBeInTheDocument(),
        );

        expect(screen.getByText('Team Alpha')).toBeInTheDocument();
    });

    it('creates a team with a free-form player name', async () => {
        setupGetMocks([]);

        const createdTeam = makeTeam(21, 'Team Beta', [
            { id: 6, user_id: null, display_name: 'Roberto' },
        ]);

        axios.post
            .mockResolvedValueOnce(makeGameSummary([createdTeam]))
            .mockResolvedValueOnce(makeGameSummary([createdTeam]));

        render(<TeamsCard selectedGame={selectedGame} />);

        await waitFor(() =>
            expect(screen.getByRole('button', { name: 'Add team' })).toBeEnabled(),
        );

        await userEvent.click(screen.getByRole('button', { name: 'Add team' }));

        await userEvent.type(screen.getByLabelText('Team name'), 'Team Beta');
        await userEvent.type(screen.getByLabelText('Player name'), 'Roberto');
        await userEvent.click(screen.getByRole('button', { name: 'Add player' }));

        await userEvent.click(screen.getByRole('button', { name: 'Create team' }));

        await waitFor(() =>
            expect(axios.post).toHaveBeenCalledWith(
                '/api/v1/games/5/teams/21/players',
                { name: 'Roberto' },
            ),
        );

        await waitFor(() =>
            expect(screen.queryByText('Create a team')).not.toBeInTheDocument(),
        );
    });

    it('shows a validation error when team name is empty', async () => {
        setupGetMocks([]);

        render(<TeamsCard selectedGame={selectedGame} />);

        await waitFor(() =>
            expect(screen.getByRole('button', { name: 'Add team' })).toBeEnabled(),
        );

        await userEvent.click(screen.getByRole('button', { name: 'Add team' }));
        await userEvent.click(screen.getByRole('button', { name: 'Create team' }));

        expect(screen.getByText('A team name is required.')).toBeInTheDocument();
        expect(axios.post).not.toHaveBeenCalled();
    });

    it('shows a validation error when adding a player with an empty name', async () => {
        setupGetMocks([]);

        render(<TeamsCard selectedGame={selectedGame} />);

        await waitFor(() =>
            expect(screen.getByRole('button', { name: 'Add team' })).toBeEnabled(),
        );

        await userEvent.click(screen.getByRole('button', { name: 'Add team' }));
        await userEvent.click(screen.getByRole('button', { name: 'Add player' }));

        expect(screen.getByText('Player name is required.')).toBeInTheDocument();
    });
});
