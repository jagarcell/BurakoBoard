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

const mockAllTeams = [
    { id: 100, name: 'Old Team A', players: [] },
    { id: 101, name: 'Old Team B', players: [{ id: 10, user_id: null, display_name: 'Carlos' }] },
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

const setupGetMocks = (teams = [], allTeams = mockAllTeams) => {
    axios.get.mockImplementation((url) => {
        if (url === '/api/v1/users') {
            return Promise.resolve({ data: { data: { users: mockUsers } } });
        }

        if (url === '/api/v1/teams') {
            return Promise.resolve({ data: { data: { teams: allTeams } } });
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

    it('shows two Create team buttons when game has no teams', async () => {
        setupGetMocks([]);

        render(<TeamsCard selectedGame={selectedGame} />);

        await waitFor(() =>
            expect(screen.getAllByRole('button', { name: 'Create team' })).toHaveLength(2),
        );
    });

    it('shows one Create team button when game has one team', async () => {
        setupGetMocks([makeTeam(10, 'Team Alpha')]);

        render(<TeamsCard selectedGame={selectedGame} />);

        await screen.findByText('Team Alpha');

        expect(screen.getAllByRole('button', { name: 'Create team' })).toHaveLength(1);
    });

    it('shows no Create team button and two Edit team buttons when game has two teams', async () => {
        setupGetMocks([makeTeam(10, 'Team Alpha'), makeTeam(11, 'Team Beta')]);

        render(<TeamsCard selectedGame={selectedGame} />);

        await waitFor(() =>
            expect(screen.getAllByRole('button', { name: 'Edit team' })).toHaveLength(2),
        );

        expect(screen.queryByRole('button', { name: 'Create team' })).not.toBeInTheDocument();
    });

    it('renders existing teams and their players with an Edit team button each', async () => {
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
        expect(screen.getAllByRole('button', { name: 'Edit team' })).toHaveLength(2);
    });

    it('lists existing teams in the slot selector dropdown', async () => {
        setupGetMocks([], mockAllTeams);

        render(<TeamsCard selectedGame={selectedGame} />);

        const selectors = await screen.findAllByRole('combobox');
        await waitFor(() =>
            expect(within(selectors[0]).getByRole('option', { name: 'Old Team A' })).toBeInTheDocument(),
        );
        expect(within(selectors[0]).getByRole('option', { name: 'Old Team B' })).toBeInTheDocument();
    });

    it('shows Add team button when an existing team is selected in the dropdown', async () => {
        setupGetMocks([], mockAllTeams);

        render(<TeamsCard selectedGame={selectedGame} />);

        const selectors = await screen.findAllByRole('combobox');
        await waitFor(() =>
            within(selectors[0]).getByRole('option', { name: 'Old Team A' }),
        );
        await userEvent.selectOptions(selectors[0], '100');

        const addButtons = screen.getAllByRole('button', { name: 'Add team' });
        expect(addButtons).toHaveLength(1);
    });

    it('adds an existing team to the game when Add team is clicked', async () => {
        setupGetMocks([], mockAllTeams);

        const copiedTeam = makeTeam(20, 'Old Team A', []);
        axios.post.mockResolvedValueOnce(makeGameSummary([copiedTeam]));

        render(<TeamsCard selectedGame={selectedGame} />);

        const selectors = await screen.findAllByRole('combobox');
        await waitFor(() => within(selectors[0]).getByRole('option', { name: 'Old Team A' }));
        await userEvent.selectOptions(selectors[0], '100');
        await userEvent.click(screen.getByRole('button', { name: 'Add team' }));

        await waitFor(() =>
            expect(axios.post).toHaveBeenCalledWith(
                '/api/v1/games/5/teams',
                { name: 'Old Team A' },
            ),
        );

        await screen.findByRole('button', { name: 'Edit team' });
    });

    it('copies player data when adding an existing team with players', async () => {
        setupGetMocks([], mockAllTeams);

        const copiedTeam = makeTeam(21, 'Old Team B', [{ id: 11, user_id: null, display_name: 'Carlos' }]);
        axios.post
            .mockResolvedValueOnce(makeGameSummary([copiedTeam]))
            .mockResolvedValueOnce(makeGameSummary([copiedTeam]));

        render(<TeamsCard selectedGame={selectedGame} />);

        const selectors = await screen.findAllByRole('combobox');
        await waitFor(() => within(selectors[0]).getByRole('option', { name: 'Old Team B' }));
        await userEvent.selectOptions(selectors[0], '101');
        await userEvent.click(screen.getByRole('button', { name: 'Add team' }));

        await waitFor(() =>
            expect(axios.post).toHaveBeenCalledWith(
                '/api/v1/games/5/teams/21/players',
                { name: 'Carlos' },
            ),
        );
    });

    it('shows registered users in the player dropdown after opening the create modal', async () => {
        setupGetMocks([]);

        render(<TeamsCard selectedGame={selectedGame} />);

        await waitFor(() =>
            expect(screen.getAllByRole('button', { name: 'Create team' })).toHaveLength(2),
        );

        await userEvent.click(screen.getAllByRole('button', { name: 'Create team' })[0]);

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
            expect(screen.getAllByRole('button', { name: 'Create team' })).toHaveLength(2),
        );

        await userEvent.click(screen.getAllByRole('button', { name: 'Create team' })[0]);

        await userEvent.type(screen.getByLabelText('Team name'), 'Team Alpha');

        const userSelect = screen.getByLabelText('Registered user (optional)');
        await waitFor(() =>
            expect(within(userSelect).getByRole('option', { name: 'Alice' })).toBeInTheDocument(),
        );
        await userEvent.selectOptions(userSelect, '1');

        expect(screen.getByLabelText('Player name')).toHaveValue('Alice');

        await userEvent.click(screen.getByRole('button', { name: 'Add player' }));

        expect(screen.getAllByText('Alice').length).toBeGreaterThanOrEqual(2);

        await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Create team' }));

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
            expect(screen.getAllByRole('button', { name: 'Create team' })).toHaveLength(2),
        );

        await userEvent.click(screen.getAllByRole('button', { name: 'Create team' })[0]);

        await userEvent.type(screen.getByLabelText('Team name'), 'Team Beta');
        await userEvent.type(screen.getByLabelText('Player name'), 'Roberto');
        await userEvent.click(screen.getByRole('button', { name: 'Add player' }));

        await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Create team' }));

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

    it('shows a validation error when team name is empty in create mode', async () => {
        setupGetMocks([]);

        render(<TeamsCard selectedGame={selectedGame} />);

        await waitFor(() =>
            expect(screen.getAllByRole('button', { name: 'Create team' })).toHaveLength(2),
        );

        await userEvent.click(screen.getAllByRole('button', { name: 'Create team' })[0]);
        await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Create team' }));

        expect(screen.getByText('A team name is required.')).toBeInTheDocument();
        expect(axios.post).not.toHaveBeenCalled();
    });

    it('shows a validation error when adding a player with an empty name', async () => {
        setupGetMocks([]);

        render(<TeamsCard selectedGame={selectedGame} />);

        await waitFor(() =>
            expect(screen.getAllByRole('button', { name: 'Create team' })).toHaveLength(2),
        );

        await userEvent.click(screen.getAllByRole('button', { name: 'Create team' })[0]);
        await userEvent.click(screen.getByRole('button', { name: 'Add player' }));

        expect(screen.getByText('Player name is required.')).toBeInTheDocument();
    });

    it('opens the edit modal with pre-filled name when Edit team is clicked', async () => {
        setupGetMocks([makeTeam(10, 'Team Alpha')]);

        render(<TeamsCard selectedGame={selectedGame} />);

        await screen.findByText('Team Alpha');
        await userEvent.click(screen.getByRole('button', { name: 'Edit team' }));

        expect(screen.getByRole('heading', { name: 'Edit team' })).toBeInTheDocument();
        expect(screen.getByLabelText('Team name')).toHaveValue('Team Alpha');
    });

    it('shows existing players in the edit modal', async () => {
        const team = makeTeam(10, 'Team Alpha', [
            { id: 1, user_id: null, display_name: 'Carlos' },
        ]);
        setupGetMocks([team]);

        render(<TeamsCard selectedGame={selectedGame} />);

        await screen.findByText('Team Alpha');
        await userEvent.click(screen.getByRole('button', { name: 'Edit team' }));

        expect(screen.getByText('Current players')).toBeInTheDocument();
    });

    it('updates team name via edit modal', async () => {
        setupGetMocks([makeTeam(10, 'Team Alpha')]);

        const updatedTeam = makeTeam(10, 'Team Alpha Updated');
        axios.put.mockResolvedValueOnce(makeGameSummary([updatedTeam]));

        render(<TeamsCard selectedGame={selectedGame} />);

        await screen.findByText('Team Alpha');
        await userEvent.click(screen.getByRole('button', { name: 'Edit team' }));

        const nameInput = screen.getByLabelText('Team name');
        await userEvent.clear(nameInput);
        await userEvent.type(nameInput, 'Team Alpha Updated');

        await userEvent.click(screen.getByRole('button', { name: 'Update team' }));

        await waitFor(() =>
            expect(axios.put).toHaveBeenCalledWith(
                '/api/v1/games/5/teams/10',
                { name: 'Team Alpha Updated' },
            ),
        );

        await waitFor(() =>
            expect(screen.queryByRole('heading', { name: 'Edit team' })).not.toBeInTheDocument(),
        );

        expect(screen.getByText('Team Alpha Updated')).toBeInTheDocument();
    });
});
