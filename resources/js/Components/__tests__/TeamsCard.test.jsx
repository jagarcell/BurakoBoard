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

const selectedGame = { id: 5, name: 'Friday Table', target_points: 2000, status: 'in_progress' };
const finishedGame = { id: 5, name: 'Friday Table', target_points: 2000, status: 'finished' };

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

const setupGetMocks = (allTeams = mockAllTeams) => {
    axios.get.mockImplementation((url) => {
        if (url === '/api/v1/users') {
            return Promise.resolve({ data: { data: { users: mockUsers } } });
        }

        if (url === '/api/v1/teams') {
            return Promise.resolve({ data: { data: { teams: allTeams } } });
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

        render(<TeamsCard initialTeams={[]} selectedGame={null} />);

        expect(
            screen.getByText('Select a game above to manage its teams.'),
        ).toBeInTheDocument();
    });

    it('shows two Create team buttons when game has no teams', async () => {
        setupGetMocks();

        render(<TeamsCard initialTeams={[]} selectedGame={selectedGame} />);

        await waitFor(() =>
            expect(screen.getAllByRole('button', { name: 'Create team' })).toHaveLength(2),
        );
    });

    it('shows one Create team button when game has one team', async () => {
        setupGetMocks();

        render(<TeamsCard initialTeams={[makeTeam(10, 'Team Alpha')]} selectedGame={selectedGame} />);

        await screen.findByText('Team Alpha');

        expect(screen.getAllByRole('button', { name: 'Create team' })).toHaveLength(1);
    });

    it('shows no Create team button and two Edit team buttons when game has two teams', async () => {
        setupGetMocks();

        render(<TeamsCard initialTeams={[makeTeam(10, 'Team Alpha'), makeTeam(11, 'Team Beta')]} selectedGame={selectedGame} />);

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

        setupGetMocks();

        render(<TeamsCard initialTeams={teams} selectedGame={selectedGame} />);

        await screen.findByText('Team Alpha');
        expect(screen.getByText('Carlos')).toBeInTheDocument();
        expect(screen.getByText('Team Beta')).toBeInTheDocument();
        expect(screen.getByText('No players yet.')).toBeInTheDocument();
        expect(screen.getAllByRole('button', { name: 'Edit team' })).toHaveLength(2);
    });

    it('lists existing teams in the slot selector dropdown', async () => {
        setupGetMocks(mockAllTeams);

        render(<TeamsCard initialTeams={[]} selectedGame={selectedGame} />);

        const selectors = await screen.findAllByRole('combobox');
        await waitFor(() =>
            expect(within(selectors[0]).getByRole('option', { name: 'Old Team A' })).toBeInTheDocument(),
        );
        expect(within(selectors[0]).getByRole('option', { name: 'Old Team B' })).toBeInTheDocument();
    });

    it('excludes a team selected in one slot from the other slot dropdown', async () => {
        setupGetMocks(mockAllTeams);

        render(<TeamsCard initialTeams={[]} selectedGame={selectedGame} />);

        const selectors = await screen.findAllByRole('combobox');
        await waitFor(() =>
            within(selectors[0]).getByRole('option', { name: 'Old Team A' }),
        );

        // Select "Old Team A" (id 100) in slot 0
        await userEvent.selectOptions(selectors[0], '100');

        // Slot 1 should no longer offer "Old Team A"
        expect(within(selectors[1]).queryByRole('option', { name: 'Old Team A' })).not.toBeInTheDocument();
        // But "Old Team B" should still be available in slot 1
        expect(within(selectors[1]).getByRole('option', { name: 'Old Team B' })).toBeInTheDocument();
    });

    it('shows Add team button when an existing team is selected in the dropdown', async () => {
        setupGetMocks(mockAllTeams);

        render(<TeamsCard initialTeams={[]} selectedGame={selectedGame} />);

        const selectors = await screen.findAllByRole('combobox');
        await waitFor(() =>
            within(selectors[0]).getByRole('option', { name: 'Old Team A' }),
        );
        await userEvent.selectOptions(selectors[0], '100');

        const addButtons = screen.getAllByRole('button', { name: 'Add team' });
        expect(addButtons).toHaveLength(1);
    });

    it('adds an existing team to the game when Add team is clicked', async () => {
        setupGetMocks(mockAllTeams);

        const attachedTeam = makeTeam(100, 'Old Team A', []);
        axios.post.mockResolvedValueOnce(makeGameSummary([attachedTeam]));

        render(<TeamsCard initialTeams={[]} selectedGame={selectedGame} />);

        const selectors = await screen.findAllByRole('combobox');
        await waitFor(() => within(selectors[0]).getByRole('option', { name: 'Old Team A' }));
        await userEvent.selectOptions(selectors[0], '100');
        await userEvent.click(screen.getByRole('button', { name: 'Add team' }));

        await waitFor(() =>
            expect(axios.post).toHaveBeenCalledWith(
                '/api/v1/games/5/teams/100/attach',
            ),
        );

        await screen.findByRole('button', { name: 'Edit team' });
    });

    it('attaches an existing team with players without re-posting players', async () => {
        setupGetMocks(mockAllTeams);

        const attachedTeam = makeTeam(101, 'Old Team B', [{ id: 11, user_id: null, display_name: 'Carlos' }]);
        axios.post.mockResolvedValueOnce(makeGameSummary([attachedTeam]));

        render(<TeamsCard initialTeams={[]} selectedGame={selectedGame} />);

        const selectors = await screen.findAllByRole('combobox');
        await waitFor(() => within(selectors[0]).getByRole('option', { name: 'Old Team B' }));
        await userEvent.selectOptions(selectors[0], '101');
        await userEvent.click(screen.getByRole('button', { name: 'Add team' }));

        await waitFor(() =>
            expect(axios.post).toHaveBeenCalledWith(
                '/api/v1/games/5/teams/101/attach',
            ),
        );

        // Only one POST call — the attach endpoint, no separate player calls.
        expect(axios.post).toHaveBeenCalledTimes(1);
    });

    it('shows registered users in the player dropdown after opening the create modal', async () => {
        setupGetMocks();

        render(<TeamsCard initialTeams={[]} selectedGame={selectedGame} />);

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
        setupGetMocks();

        const createdTeam = makeTeam(20, 'Team Alpha', [
            { id: 5, user_id: 1, display_name: 'Alice' },
        ]);

        axios.post
            .mockResolvedValueOnce(makeGameSummary([createdTeam]))
            .mockResolvedValueOnce(makeGameSummary([createdTeam]));

        render(<TeamsCard initialTeams={[]} selectedGame={selectedGame} />);

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
        setupGetMocks();

        const createdTeam = makeTeam(21, 'Team Beta', [
            { id: 6, user_id: null, display_name: 'Roberto' },
        ]);

        axios.post
            .mockResolvedValueOnce(makeGameSummary([createdTeam]))
            .mockResolvedValueOnce(makeGameSummary([createdTeam]));

        render(<TeamsCard initialTeams={[]} selectedGame={selectedGame} />);

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
        setupGetMocks();

        render(<TeamsCard initialTeams={[]} selectedGame={selectedGame} />);

        await waitFor(() =>
            expect(screen.getAllByRole('button', { name: 'Create team' })).toHaveLength(2),
        );

        await userEvent.click(screen.getAllByRole('button', { name: 'Create team' })[0]);
        await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Create team' }));

        expect(screen.getByText('A team name is required.')).toBeInTheDocument();
        expect(axios.post).not.toHaveBeenCalled();
    });

    it('shows a validation error when adding a player with an empty name', async () => {
        setupGetMocks();

        render(<TeamsCard initialTeams={[]} selectedGame={selectedGame} />);

        await waitFor(() =>
            expect(screen.getAllByRole('button', { name: 'Create team' })).toHaveLength(2),
        );

        await userEvent.click(screen.getAllByRole('button', { name: 'Create team' })[0]);
        await userEvent.click(screen.getByRole('button', { name: 'Add player' }));

        expect(screen.getByText('Player name is required.')).toBeInTheDocument();
    });

    it('opens the edit modal with pre-filled name when Edit team is clicked', async () => {
        setupGetMocks();

        render(<TeamsCard initialTeams={[makeTeam(10, 'Team Alpha')]} selectedGame={selectedGame} />);

        await screen.findByText('Team Alpha');
        await userEvent.click(screen.getByRole('button', { name: 'Edit team' }));

        expect(screen.getByRole('heading', { name: 'Edit team' })).toBeInTheDocument();
        expect(screen.getByLabelText('Team name')).toHaveValue('Team Alpha');
    });

    it('shows existing players in the edit modal', async () => {
        const team = makeTeam(10, 'Team Alpha', [
            { id: 1, user_id: null, display_name: 'Carlos' },
        ]);
        setupGetMocks();

        render(<TeamsCard initialTeams={[team]} selectedGame={selectedGame} />);

        await screen.findByText('Team Alpha');
        await userEvent.click(screen.getByRole('button', { name: 'Edit team' }));

        expect(screen.getByText('Current players')).toBeInTheDocument();
    });

    it('updates team name via edit modal', async () => {
        setupGetMocks();

        const updatedTeam = makeTeam(10, 'Team Alpha Updated');
        axios.put.mockResolvedValueOnce(makeGameSummary([updatedTeam]));

        render(<TeamsCard initialTeams={[makeTeam(10, 'Team Alpha')]} selectedGame={selectedGame} />);

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

    it('shows a duplicate-name error and does not call the API when creating with a name that already exists', async () => {
        setupGetMocks();

        render(<TeamsCard initialTeams={[makeTeam(10, 'Team Alpha')]} selectedGame={selectedGame} />);

        await screen.findByText('Team Alpha');
        await userEvent.click(screen.getByRole('button', { name: 'Create team' }));

        await userEvent.type(screen.getByLabelText('Team name'), 'Team Alpha');
        await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Create team' }));

        expect(screen.getByText('A team with this name already exists.')).toBeInTheDocument();
        expect(axios.post).not.toHaveBeenCalled();
    });

    it('normalises extra spaces when checking for duplicate names on create', async () => {
        setupGetMocks();

        render(<TeamsCard initialTeams={[makeTeam(10, 'Team Alpha')]} selectedGame={selectedGame} />);

        await screen.findByText('Team Alpha');
        await userEvent.click(screen.getByRole('button', { name: 'Create team' }));

        await userEvent.type(screen.getByLabelText('Team name'), '  Team  Alpha  ');
        await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Create team' }));

        expect(screen.getByText('A team with this name already exists.')).toBeInTheDocument();
        expect(axios.post).not.toHaveBeenCalled();
    });

    it('rejects a globally-existing team name even when that team is not yet in the current game', async () => {
        // allTeams contains 'Old Team A' (id 100) which is not in initialTeams (game has no teams yet).
        setupGetMocks(mockAllTeams);

        render(<TeamsCard initialTeams={[]} selectedGame={selectedGame} />);

        await waitFor(() =>
            expect(screen.getAllByRole('button', { name: 'Create team' })).toHaveLength(2),
        );
        await userEvent.click(screen.getAllByRole('button', { name: 'Create team' })[0]);

        await waitFor(() =>
            expect(screen.getByLabelText('Team name')).toBeInTheDocument(),
        );
        await userEvent.type(screen.getByLabelText('Team name'), 'Old Team A');
        await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Create team' }));

        expect(screen.getByText('A team with this name already exists.')).toBeInTheDocument();
        expect(axios.post).not.toHaveBeenCalled();
    });

    it('rejects a duplicate name that differs only in casing when creating', async () => {
        setupGetMocks();

        render(<TeamsCard initialTeams={[makeTeam(10, 'Team Alpha')]} selectedGame={selectedGame} />);

        await screen.findByText('Team Alpha');
        await userEvent.click(screen.getByRole('button', { name: 'Create team' }));

        await userEvent.type(screen.getByLabelText('Team name'), 'TEAM ALPHA');
        await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Create team' }));

        expect(screen.getByText('A team with this name already exists.')).toBeInTheDocument();
        expect(axios.post).not.toHaveBeenCalled();
    });

    it('shows a duplicate-player error and does not add when player name already exists in pending list', async () => {
        setupGetMocks();

        render(<TeamsCard initialTeams={[]} selectedGame={selectedGame} />);

        await waitFor(() =>
            expect(screen.getAllByRole('button', { name: 'Create team' })).toHaveLength(2),
        );

        await userEvent.click(screen.getAllByRole('button', { name: 'Create team' })[0]);

        // Add the first player successfully
        await userEvent.type(screen.getByLabelText('Player name'), 'Carlos');
        await userEvent.click(screen.getByRole('button', { name: 'Add player' }));
        expect(screen.queryByText('A player with this name already exists in this team.')).not.toBeInTheDocument();

        // Attempt to add the same player again — error flashes
        await userEvent.type(screen.getByLabelText('Player name'), 'Carlos');
        await userEvent.click(screen.getByRole('button', { name: 'Add player' }));

        expect(screen.getByText('A player with this name already exists in this team.')).toBeInTheDocument();
    });

    it('normalises extra spaces when checking for duplicate player names in pending list', async () => {
        setupGetMocks();

        render(<TeamsCard initialTeams={[]} selectedGame={selectedGame} />);

        await waitFor(() =>
            expect(screen.getAllByRole('button', { name: 'Create team' })).toHaveLength(2),
        );

        await userEvent.click(screen.getAllByRole('button', { name: 'Create team' })[0]);

        await userEvent.type(screen.getByLabelText('Player name'), 'Carlos');
        await userEvent.click(screen.getByRole('button', { name: 'Add player' }));

        // Type with extra spaces — should still be treated as a duplicate
        await userEvent.type(screen.getByLabelText('Player name'), '  Carlos  ');
        await userEvent.click(screen.getByRole('button', { name: 'Add player' }));

        expect(screen.getByText('A player with this name already exists in this team.')).toBeInTheDocument();
    });

    it('rejects a duplicate player name that differs only in casing in pending list', async () => {
        setupGetMocks();

        render(<TeamsCard initialTeams={[]} selectedGame={selectedGame} />);

        await waitFor(() =>
            expect(screen.getAllByRole('button', { name: 'Create team' })).toHaveLength(2),
        );

        await userEvent.click(screen.getAllByRole('button', { name: 'Create team' })[0]);

        await userEvent.type(screen.getByLabelText('Player name'), 'Carlos');
        await userEvent.click(screen.getByRole('button', { name: 'Add player' }));

        await userEvent.type(screen.getByLabelText('Player name'), 'CARLOS');
        await userEvent.click(screen.getByRole('button', { name: 'Add player' }));

        expect(screen.getByText('A player with this name already exists in this team.')).toBeInTheDocument();
    });

    it('shows duplicate-player error when player name matches an existing player in edit mode', async () => {
        setupGetMocks();

        const team = makeTeam(10, 'Team Alpha', [{ id: 1, user_id: null, display_name: 'Carlos' }]);
        render(<TeamsCard initialTeams={[team]} selectedGame={selectedGame} />);

        await screen.findByText('Team Alpha');
        await userEvent.click(screen.getByRole('button', { name: 'Edit team' }));

        await userEvent.type(screen.getByLabelText('Player name'), 'Carlos');
        await userEvent.click(screen.getByRole('button', { name: 'Add player' }));

        expect(screen.getByText('A player with this name already exists in this team.')).toBeInTheDocument();
    });

    it('rejects player duplicate in edit mode case-insensitively', async () => {
        setupGetMocks();

        const team = makeTeam(10, 'Team Alpha', [{ id: 1, user_id: null, display_name: 'Carlos' }]);
        render(<TeamsCard initialTeams={[team]} selectedGame={selectedGame} />);

        await screen.findByText('Team Alpha');
        await userEvent.click(screen.getByRole('button', { name: 'Edit team' }));

        await userEvent.type(screen.getByLabelText('Player name'), 'CARLOS');
        await userEvent.click(screen.getByRole('button', { name: 'Add player' }));

        expect(screen.getByText('A player with this name already exists in this team.')).toBeInTheDocument();
    });

    it('duplicate player error auto-dismisses after 3 seconds', async () => {
        vi.spyOn(global, 'setTimeout');
        setupGetMocks();

        render(<TeamsCard initialTeams={[]} selectedGame={selectedGame} />);

        await waitFor(() =>
            expect(screen.getAllByRole('button', { name: 'Create team' })).toHaveLength(2),
        );

        await userEvent.click(screen.getAllByRole('button', { name: 'Create team' })[0]);
        await userEvent.type(screen.getByLabelText('Player name'), 'Carlos');
        await userEvent.click(screen.getByRole('button', { name: 'Add player' }));

        // Trigger the duplicate error
        await userEvent.type(screen.getByLabelText('Player name'), 'Carlos');
        await userEvent.click(screen.getByRole('button', { name: 'Add player' }));

        expect(screen.getByText('A player with this name already exists in this team.')).toBeInTheDocument();
        expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 3000);

        vi.restoreAllMocks();
    });

    it('shows a score badge with green bisque styling when team score is 0', async () => {
        const team = { ...makeTeam(10, 'Team Alpha'), current_score: 0 };
        setupGetMocks();

        render(<TeamsCard initialTeams={[team]} selectedGame={selectedGame} />);

        await screen.findByText('Team Alpha');

        const badge = screen.getByRole('generic', { name: 'Team Alpha score' });
        expect(badge).toHaveTextContent('0');
        expect(badge).toHaveClass('bg-[bisque]', 'text-green-700');
    });

    it('shows a score badge with green styling when team score is positive', async () => {
        const team = { ...makeTeam(10, 'Team Alpha'), current_score: 850 };
        setupGetMocks();

        render(<TeamsCard initialTeams={[team]} selectedGame={selectedGame} />);

        await screen.findByText('Team Alpha');

        const badge = screen.getByRole('generic', { name: 'Team Alpha score' });
        expect(badge).toHaveTextContent('850');
        expect(badge).toHaveClass('bg-green-100', 'text-green-800');
    });

    it('shows a score badge with red styling when team score is negative', async () => {
        const team = { ...makeTeam(10, 'Team Alpha'), current_score: -200 };
        setupGetMocks();

        render(<TeamsCard initialTeams={[team]} selectedGame={selectedGame} />);

        await screen.findByText('Team Alpha');

        const badge = screen.getByRole('generic', { name: 'Team Alpha score' });
        expect(badge).toHaveTextContent('-200');
        expect(badge).toHaveClass('bg-red-100', 'text-red-800');
    });

    it('hides the header description when both teams are assigned', async () => {
        const teams = [
            makeTeam(10, 'Team Alpha', [{ id: 1, user_id: null, display_name: 'Carlos' }]),
            makeTeam(11, 'Team Beta', []),
        ];
        setupGetMocks();

        render(<TeamsCard initialTeams={teams} selectedGame={selectedGame} />);

        await screen.findByText('Team Alpha');

        expect(screen.queryByText('Build the two teams for this game.')).not.toBeInTheDocument();
        expect(screen.getByText('Teams')).toBeInTheDocument();
        expect(screen.getByText('Team Alpha')).toBeInTheDocument();
        expect(screen.getByText('Team Beta')).toBeInTheDocument();
        expect(screen.getAllByRole('button', { name: 'Edit team' })).toHaveLength(2);
    });

    it('shows the header description when fewer than two teams are assigned', async () => {
        setupGetMocks();

        render(<TeamsCard initialTeams={[makeTeam(10, 'Team Alpha')]} selectedGame={selectedGame} />);

        await screen.findByText('Team Alpha');

        expect(screen.getByText('Build the two teams for this game.')).toBeInTheDocument();
    });

    it('collapses only the player lists when the collapse button is clicked', async () => {
        const teams = [
            makeTeam(10, 'Team Alpha', [{ id: 1, user_id: null, display_name: 'Carlos' }]),
            makeTeam(11, 'Team Beta', []),
        ];
        setupGetMocks();

        render(<TeamsCard initialTeams={teams} selectedGame={selectedGame} />);

        await screen.findByText('Team Alpha');
        expect(screen.getByText('Carlos')).toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', { name: 'Collapse teams section' }));

        // player list hidden
        expect(screen.queryByText('Carlos')).not.toBeInTheDocument();
        // team names and edit buttons still visible
        expect(screen.getByText('Team Alpha')).toBeInTheDocument();
        expect(screen.getByText('Team Beta')).toBeInTheDocument();
        expect(screen.getAllByRole('button', { name: 'Edit team' })).toHaveLength(2);
        expect(screen.getByRole('generic', { name: 'Team Alpha score' })).toBeInTheDocument();
        // header description still absent (two teams assigned)
        expect(screen.queryByText('Build the two teams for this game.')).not.toBeInTheDocument();
    });

    it('expands the player lists back when the expand button is clicked', async () => {
        const teams = [
            makeTeam(10, 'Team Alpha', [{ id: 1, user_id: null, display_name: 'Carlos' }]),
            makeTeam(11, 'Team Beta', []),
        ];
        setupGetMocks();

        render(<TeamsCard initialTeams={teams} selectedGame={selectedGame} />);

        await screen.findByText('Team Alpha');

        await userEvent.click(screen.getByRole('button', { name: 'Collapse teams section' }));
        expect(screen.queryByText('Carlos')).not.toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', { name: 'Expand teams section' }));
        expect(screen.getByText('Carlos')).toBeInTheDocument();
    });

    it('does not show the collapse button when fewer than two teams are assigned', async () => {
        setupGetMocks();

        render(<TeamsCard initialTeams={[makeTeam(10, 'Team Alpha')]} selectedGame={selectedGame} />);

        await screen.findByText('Team Alpha');

        expect(screen.queryByRole('button', { name: 'Collapse teams section' })).not.toBeInTheDocument();
    });

    it('reactively updates score badges when scoreUpdate prop changes', async () => {
        const teamAtZero = { ...makeTeam(10, 'Team Alpha'), current_score: 0 };
        setupGetMocks();

        const { rerender } = render(<TeamsCard initialTeams={[teamAtZero]} scoreUpdate={null} selectedGame={selectedGame} />);

        await screen.findByText('Team Alpha');
        expect(screen.getByRole('generic', { name: 'Team Alpha score' })).toHaveTextContent('0');

        const updatedTeam = { ...teamAtZero, current_score: 800 };

        rerender(<TeamsCard initialTeams={[teamAtZero]} scoreUpdate={[updatedTeam]} selectedGame={selectedGame} />);

        await waitFor(() =>
            expect(screen.getByRole('generic', { name: 'Team Alpha score' })).toHaveTextContent('800'),
        );

        expect(axios.get).toHaveBeenCalledTimes(2); // users + teams only — no GET for game summary or score update
    });

    it('shows API error message from the game field when the update fails because the game is finished', async () => {
        setupGetMocks();

        const apiError = { response: { data: { data: { errors: { game: ['Cannot update teams in a finished game.'] } } } } };
        axios.put.mockRejectedValueOnce(apiError);

        render(<TeamsCard initialTeams={[makeTeam(10, 'Team Alpha')]} selectedGame={selectedGame} />);

        await screen.findByText('Team Alpha');
        await userEvent.click(screen.getByRole('button', { name: 'Edit team' }));

        const nameInput = screen.getByLabelText('Team name');
        await userEvent.clear(nameInput);
        await userEvent.type(nameInput, 'Team Alpha Updated');

        await userEvent.click(screen.getByRole('button', { name: 'Update team' }));

        await waitFor(() =>
            expect(screen.getByText('Cannot update teams in a finished game.')).toBeInTheDocument(),
        );
    });

    it('shows a name field error from the API and marks the team name input invalid on update', async () => {
        setupGetMocks();

        const apiError = { response: { data: { data: { errors: { name: ['A team with this name already exists in this game.'] } } } } };
        axios.put.mockRejectedValueOnce(apiError);

        render(<TeamsCard initialTeams={[makeTeam(10, 'Team Alpha')]} selectedGame={selectedGame} />);

        await screen.findByText('Team Alpha');
        await userEvent.click(screen.getByRole('button', { name: 'Edit team' }));

        const nameInput = screen.getByLabelText('Team name');
        await userEvent.clear(nameInput);
        await userEvent.type(nameInput, 'Team Beta');

        await userEvent.click(screen.getByRole('button', { name: 'Update team' }));

        await waitFor(() =>
            expect(screen.getAllByText('A team with this name already exists in this game.').length).toBeGreaterThan(0),
        );
    });

    it('shows a generic fallback error when the API returns no structured errors', async () => {
        setupGetMocks();

        axios.put.mockRejectedValueOnce(new Error('Network Error'));

        render(<TeamsCard initialTeams={[makeTeam(10, 'Team Alpha')]} selectedGame={selectedGame} />);

        await screen.findByText('Team Alpha');
        await userEvent.click(screen.getByRole('button', { name: 'Edit team' }));

        const nameInput = screen.getByLabelText('Team name');
        await userEvent.clear(nameInput);
        await userEvent.type(nameInput, 'Team Alpha Updated');

        await userEvent.click(screen.getByRole('button', { name: 'Update team' }));

        await waitFor(() =>
            expect(screen.getByText('Unable to save the team right now.')).toBeInTheDocument(),
        );
    });

    it('hides the Edit team button when the game is finished', async () => {
        setupGetMocks();

        render(<TeamsCard initialTeams={[makeTeam(10, 'Team Alpha')]} selectedGame={finishedGame} />);

        await screen.findByText('Team Alpha');

        expect(screen.queryByRole('button', { name: 'Edit team' })).not.toBeInTheDocument();
    });

    it('hides Create team and slot selector for empty slots when the game is finished', async () => {
        setupGetMocks();

        render(<TeamsCard initialTeams={[]} selectedGame={finishedGame} />);

        await screen.findAllByText('No team assigned.');

        expect(screen.queryByRole('button', { name: 'Create team' })).not.toBeInTheDocument();
    });

    it('shows No team assigned for empty slots when the game is finished', async () => {
        setupGetMocks();

        render(<TeamsCard initialTeams={[makeTeam(10, 'Team Alpha')]} selectedGame={finishedGame} />);

        await screen.findByText('Team Alpha');

        expect(screen.getByText('No team assigned.')).toBeInTheDocument();
    });

    it('shows a winner badge on the team with the highest score when a game is finished', async () => {
        setupGetMocks();

        const winner = { ...makeTeam(10, 'Team Alpha'), current_score: 2100 };
        const loser = { ...makeTeam(11, 'Team Beta'), current_score: 800 };

        render(<TeamsCard initialTeams={[winner, loser]} selectedGame={finishedGame} />);

        await screen.findByText('Team Alpha');

        expect(screen.getByRole('button', { name: 'Team Alpha winner' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Team Beta winner' })).not.toBeInTheDocument();
    });

    it('does not show a winner badge on the losing team when a game is finished', async () => {
        setupGetMocks();

        const winner = { ...makeTeam(10, 'Team Alpha'), current_score: 2100 };
        const loser = { ...makeTeam(11, 'Team Beta'), current_score: 800 };

        render(<TeamsCard initialTeams={[winner, loser]} selectedGame={finishedGame} />);

        await screen.findByText('Team Beta');

        expect(screen.queryByRole('button', { name: 'Team Beta winner' })).not.toBeInTheDocument();
    });

    it('shows no winner badge when the game is finished with tied scores', async () => {
        setupGetMocks();

        const teamA = { ...makeTeam(10, 'Team Alpha'), current_score: 1500 };
        const teamB = { ...makeTeam(11, 'Team Beta'), current_score: 1500 };

        render(<TeamsCard initialTeams={[teamA, teamB]} selectedGame={finishedGame} />);

        await screen.findByText('Team Alpha');

        expect(screen.queryByRole('button', { name: 'Team Alpha winner' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Team Beta winner' })).not.toBeInTheDocument();
    });

    it('calls onWinnerBadgeClick when the winner badge is clicked', async () => {
        setupGetMocks();

        const onWinnerBadgeClick = vi.fn();
        const winner = { ...makeTeam(10, 'Team Alpha'), current_score: 2100 };
        const loser  = { ...makeTeam(11, 'Team Beta'),  current_score: 800 };

        render(
            <TeamsCard
                initialTeams={[winner, loser]}
                onWinnerBadgeClick={onWinnerBadgeClick}
                selectedGame={finishedGame}
            />,
        );

        await screen.findByText('Team Alpha');

        await userEvent.click(screen.getByRole('button', { name: 'Team Alpha winner' }));

        expect(onWinnerBadgeClick).toHaveBeenCalledTimes(1);
    });

    it('calls onTeamsChange with the updated teams list when a new team is created', async () => {
        setupGetMocks();

        const onTeamsChange = vi.fn();
        const createdTeam = makeTeam(20, 'Team Alpha');
        axios.post.mockResolvedValueOnce(makeGameSummary([createdTeam]));

        render(<TeamsCard initialTeams={[]} onTeamsChange={onTeamsChange} selectedGame={selectedGame} />);

        await waitFor(() =>
            expect(screen.getAllByRole('button', { name: 'Create team' })).toHaveLength(2),
        );

        await userEvent.click(screen.getAllByRole('button', { name: 'Create team' })[0]);
        await userEvent.type(screen.getByLabelText('Team name'), 'Team Alpha');
        await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Create team' }));

        await waitFor(() =>
            expect(onTeamsChange).toHaveBeenCalledWith([createdTeam]),
        );
    });

    it('calls onTeamsChange with the updated teams list when an existing team is edited', async () => {
        setupGetMocks();

        const onTeamsChange = vi.fn();
        const updatedTeam = makeTeam(10, 'Team Alpha Updated');
        axios.put.mockResolvedValueOnce(makeGameSummary([updatedTeam]));

        render(<TeamsCard initialTeams={[makeTeam(10, 'Team Alpha')]} onTeamsChange={onTeamsChange} selectedGame={selectedGame} />);

        await screen.findByText('Team Alpha');
        await userEvent.click(screen.getByRole('button', { name: 'Edit team' }));

        const nameInput = screen.getByLabelText('Team name');
        await userEvent.clear(nameInput);
        await userEvent.type(nameInput, 'Team Alpha Updated');
        await userEvent.click(screen.getByRole('button', { name: 'Update team' }));

        await waitFor(() =>
            expect(onTeamsChange).toHaveBeenCalledWith([updatedTeam]),
        );
    });

    it('calls onTeamsChange with the updated teams list when an existing team is added via slot selector', async () => {
        setupGetMocks(mockAllTeams);

        const onTeamsChange = vi.fn();
        const copiedTeam = makeTeam(20, 'Old Team A');
        axios.post.mockResolvedValueOnce(makeGameSummary([copiedTeam]));

        render(<TeamsCard initialTeams={[]} onTeamsChange={onTeamsChange} selectedGame={selectedGame} />);

        const selectors = await screen.findAllByRole('combobox');
        await waitFor(() => within(selectors[0]).getByRole('option', { name: 'Old Team A' }));
        await userEvent.selectOptions(selectors[0], '100');
        await userEvent.click(screen.getByRole('button', { name: 'Add team' }));

        await waitFor(() =>
            expect(onTeamsChange).toHaveBeenCalledWith([copiedTeam]),
        );
    });

    it('calls onTeamCreated after a new team is created', async () => {
        setupGetMocks();

        const onTeamCreated = vi.fn();
        const createdTeam = makeTeam(20, 'Team Alpha');
        axios.post.mockResolvedValueOnce(makeGameSummary([createdTeam]));

        render(<TeamsCard initialTeams={[]} onTeamCreated={onTeamCreated} selectedGame={selectedGame} />);

        await waitFor(() =>
            expect(screen.getAllByRole('button', { name: 'Create team' })).toHaveLength(2),
        );

        await userEvent.click(screen.getAllByRole('button', { name: 'Create team' })[0]);
        await userEvent.type(screen.getByLabelText('Team name'), 'Team Alpha');
        await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Create team' }));

        await waitFor(() => expect(onTeamCreated).toHaveBeenCalledTimes(1));
    });

    it('calls onTeamCreated after an existing team is added via slot selector', async () => {
        setupGetMocks(mockAllTeams);

        const onTeamCreated = vi.fn();
        const copiedTeam = makeTeam(20, 'Old Team A');
        axios.post.mockResolvedValueOnce(makeGameSummary([copiedTeam]));

        render(<TeamsCard initialTeams={[]} onTeamCreated={onTeamCreated} selectedGame={selectedGame} />);

        const selectors = await screen.findAllByRole('combobox');
        await waitFor(() => within(selectors[0]).getByRole('option', { name: 'Old Team A' }));
        await userEvent.selectOptions(selectors[0], '100');
        await userEvent.click(screen.getByRole('button', { name: 'Add team' }));

        await waitFor(() => expect(onTeamCreated).toHaveBeenCalledTimes(1));
    });

    it('does not call onTeamCreated when an existing team is edited', async () => {
        setupGetMocks();

        const onTeamCreated = vi.fn();
        const updatedTeam = makeTeam(10, 'Team Alpha Updated');
        axios.put.mockResolvedValueOnce(makeGameSummary([updatedTeam]));

        render(<TeamsCard initialTeams={[makeTeam(10, 'Team Alpha')]} onTeamCreated={onTeamCreated} selectedGame={selectedGame} />);

        await screen.findByText('Team Alpha');
        await userEvent.click(screen.getByRole('button', { name: 'Edit team' }));

        const nameInput = screen.getByLabelText('Team name');
        await userEvent.clear(nameInput);
        await userEvent.type(nameInput, 'Team Alpha Updated');
        await userEvent.click(screen.getByRole('button', { name: 'Update team' }));

        await waitFor(() => expect(screen.getByText('Team Alpha Updated')).toBeInTheDocument());
        expect(onTeamCreated).not.toHaveBeenCalled();
    });

    describe('score badge colour when both teams have positive scores', () => {
        it('shows a green badge on the team with the higher score', async () => {
            setupGetMocks();

            const teamA = { ...makeTeam(10, 'Team Alpha'), current_score: 1200 };
            const teamB = { ...makeTeam(11, 'Team Beta'), current_score: 800 };

            render(<TeamsCard initialTeams={[teamA, teamB]} selectedGame={selectedGame} />);

            await screen.findByText('Team Alpha');

            const badge = screen.getByRole('generic', { name: 'Team Alpha score' });
            expect(badge).toHaveClass('bg-green-100', 'text-green-800');
        });

        it('shows a yellow badge on the team with the lower score', async () => {
            setupGetMocks();

            const teamA = { ...makeTeam(10, 'Team Alpha'), current_score: 1200 };
            const teamB = { ...makeTeam(11, 'Team Beta'), current_score: 800 };

            render(<TeamsCard initialTeams={[teamA, teamB]} selectedGame={selectedGame} />);

            await screen.findByText('Team Beta');

            const badge = screen.getByRole('generic', { name: 'Team Beta score' });
            expect(badge).toHaveClass('bg-yellow-100', 'text-yellow-800');
        });

        it('shows green badges on both teams when their positive scores are equal', async () => {
            setupGetMocks();

            const teamA = { ...makeTeam(10, 'Team Alpha'), current_score: 1000 };
            const teamB = { ...makeTeam(11, 'Team Beta'), current_score: 1000 };

            render(<TeamsCard initialTeams={[teamA, teamB]} selectedGame={selectedGame} />);

            await screen.findByText('Team Alpha');

            expect(screen.getByRole('generic', { name: 'Team Alpha score' })).toHaveClass('bg-green-100', 'text-green-800');
            expect(screen.getByRole('generic', { name: 'Team Beta score' })).toHaveClass('bg-green-100', 'text-green-800');
        });

        it('does not apply yellow badge when only one team has a positive score', async () => {
            setupGetMocks();

            const teamA = { ...makeTeam(10, 'Team Alpha'), current_score: 500 };
            const teamB = { ...makeTeam(11, 'Team Beta'), current_score: -100 };

            render(<TeamsCard initialTeams={[teamA, teamB]} selectedGame={selectedGame} />);

            await screen.findByText('Team Alpha');

            expect(screen.getByRole('generic', { name: 'Team Alpha score' })).toHaveClass('bg-green-100', 'text-green-800');
            expect(screen.getByRole('generic', { name: 'Team Beta score' })).toHaveClass('bg-red-100', 'text-red-800');
        });
    });

    describe('score difference row', () => {
        it('shows the difference row between the two team rows when both teams are present', async () => {
            setupGetMocks();

            const teamA = { ...makeTeam(10, 'Team Alpha'), current_score: 1200 };
            const teamB = { ...makeTeam(11, 'Team Beta'), current_score: 800 };

            render(<TeamsCard initialTeams={[teamA, teamB]} selectedGame={selectedGame} />);

            await screen.findByText('Team Alpha');

            expect(screen.getByRole('generic', { name: 'Score difference' })).toBeInTheDocument();
            expect(screen.getByRole('generic', { name: 'Score difference' })).toHaveTextContent('400');
        });

        it('shows the difference row with the absolute value when the second team leads', async () => {
            setupGetMocks();

            const teamA = { ...makeTeam(10, 'Team Alpha'), current_score: 500 };
            const teamB = { ...makeTeam(11, 'Team Beta'), current_score: 900 };

            render(<TeamsCard initialTeams={[teamA, teamB]} selectedGame={selectedGame} />);

            await screen.findByText('Team Alpha');

            expect(screen.getByRole('generic', { name: 'Score difference' })).toHaveTextContent('400');
        });

        it('shows 0 in the difference row when both scores are equal', async () => {
            setupGetMocks();

            const teamA = { ...makeTeam(10, 'Team Alpha'), current_score: 750 };
            const teamB = { ...makeTeam(11, 'Team Beta'), current_score: 750 };

            render(<TeamsCard initialTeams={[teamA, teamB]} selectedGame={selectedGame} />);

            await screen.findByText('Team Alpha');

            expect(screen.getByRole('generic', { name: 'Score difference' })).toHaveTextContent('0');
        });

        it('does not show the difference row when only one team is present', async () => {
            setupGetMocks();

            render(<TeamsCard initialTeams={[makeTeam(10, 'Team Alpha')]} selectedGame={selectedGame} />);

            await screen.findByText('Team Alpha');

            expect(screen.queryByRole('generic', { name: 'Score difference' })).not.toBeInTheDocument();
        });

        it('does not show the difference row when no teams are present', async () => {
            setupGetMocks();

            render(<TeamsCard initialTeams={[]} selectedGame={selectedGame} />);

            await waitFor(() =>
                expect(screen.getAllByRole('button', { name: 'Create team' })).toHaveLength(2),
            );

            expect(screen.queryByRole('generic', { name: 'Score difference' })).not.toBeInTheDocument();
        });

        it('updates the difference row reactively when scoreUpdate prop changes', async () => {
            const teamA = { ...makeTeam(10, 'Team Alpha'), current_score: 1000 };
            const teamB = { ...makeTeam(11, 'Team Beta'), current_score: 1000 };

            setupGetMocks();

            const { rerender } = render(
                <TeamsCard initialTeams={[teamA, teamB]} scoreUpdate={null} selectedGame={selectedGame} />,
            );

            await screen.findByText('Team Alpha');
            expect(screen.getByRole('generic', { name: 'Score difference' })).toHaveTextContent('0');

            const updatedTeamA = { ...teamA, current_score: 1300 };

            rerender(
                <TeamsCard initialTeams={[teamA, teamB]} scoreUpdate={[updatedTeamA]} selectedGame={selectedGame} />,
            );

            await waitFor(() =>
                expect(screen.getByRole('generic', { name: 'Score difference' })).toHaveTextContent('300'),
            );
        });

        describe('arrow direction', () => {
            it('applies an upward arrow above the rectangle when the first team leads', async () => {
                setupGetMocks();

                const teamA = { ...makeTeam(10, 'Team Alpha'), current_score: 1200 };
                const teamB = { ...makeTeam(11, 'Team Beta'), current_score: 800 };

                render(<TeamsCard initialTeams={[teamA, teamB]} selectedGame={selectedGame} />);

                await screen.findByText('Team Alpha');

                // In jsdom getBoundingClientRect returns width:0, arrowHalfWidth=16, triangleWidth=32px.
                const row = screen.getByRole('generic', { name: 'Score difference' });
                const triangle = row.firstChild.firstChild;

                expect(triangle).toHaveStyle({
                    clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)',
                    width: '32px',
                });
            });

            it('applies a downward arrow below the rectangle when the second team leads', async () => {
                setupGetMocks();

                const teamA = { ...makeTeam(10, 'Team Alpha'), current_score: 500 };
                const teamB = { ...makeTeam(11, 'Team Beta'), current_score: 900 };

                render(<TeamsCard initialTeams={[teamA, teamB]} selectedGame={selectedGame} />);

                await screen.findByText('Team Alpha');

                const row = screen.getByRole('generic', { name: 'Score difference' });
                const triangle = row.lastChild.firstChild;

                expect(triangle).toHaveStyle({
                    clipPath: 'polygon(0% 0%, 100% 0%, 50% 100%)',
                    width: '32px',
                });
            });

            it('renders only the rectangle with no triangle when both teams are tied', async () => {
                setupGetMocks();

                const teamA = { ...makeTeam(10, 'Team Alpha'), current_score: 750 };
                const teamB = { ...makeTeam(11, 'Team Beta'), current_score: 750 };

                render(<TeamsCard initialTeams={[teamA, teamB]} selectedGame={selectedGame} />);

                await screen.findByText('Team Alpha');

                const row = screen.getByRole('generic', { name: 'Score difference' });

                expect(row.childElementCount).toBe(1);
                expect(row.style.clipPath).toBe('');
            });
        });
    });

    describe('allTeams refresh', () => {
        it('re-fetches the global team list after a new team is created so other teams appear in remaining slots', async () => {
            // A team that exists in the DB but was added by another session after this component mounted.
            const teamFromOtherSession = { id: 103, name: 'External Team', players: [] };
            const preExistingTeam = { id: 100, name: 'Old Team A', players: [] };

            let teamsCallCount = 0;
            axios.get.mockImplementation((url) => {
                if (url === '/api/v1/users') {
                    return Promise.resolve({ data: { data: { users: mockUsers } } });
                }
                if (url === '/api/v1/teams') {
                    teamsCallCount += 1;
                    // First call (on mount): teamFromOtherSession does not exist yet.
                    // Subsequent calls (post-create refresh): it does.
                    const teams = teamsCallCount === 1
                        ? [preExistingTeam]
                        : [teamFromOtherSession, preExistingTeam];

                    return Promise.resolve({ data: { data: { teams } } });
                }
                return Promise.reject(new Error(`Unexpected GET: ${url}`));
            });

            // The create endpoint returns a game with 'Brand New Team' (id 102) attached.
            axios.post.mockResolvedValueOnce(makeGameSummary([makeTeam(102, 'Brand New Team')]));

            render(<TeamsCard initialTeams={[]} selectedGame={selectedGame} />);

            // Wait for the initial mount fetch — 'External Team' must not be visible yet.
            const initialSelectors = await screen.findAllByRole('combobox');
            await waitFor(() =>
                within(initialSelectors[0]).getByRole('option', { name: 'Old Team A' }),
            );
            expect(within(initialSelectors[0]).queryByRole('option', { name: 'External Team' })).not.toBeInTheDocument();

            // Create a team via the modal, which fills slot 0.
            await userEvent.click(screen.getAllByRole('button', { name: 'Create team' })[0]);
            await userEvent.type(screen.getByLabelText('Team name'), 'Brand New Team');
            await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Create team' }));

            // After creation: slot 0 is now filled, slot 1 still has a combobox.
            // The refresh should have happened, so 'External Team' now appears in the slot-1 dropdown.
            const remainingSelectors = await screen.findAllByRole('combobox');
            await waitFor(() =>
                expect(
                    within(remainingSelectors[0]).getByRole('option', { name: 'External Team' }),
                ).toBeInTheDocument(),
            );
        });
    });

    describe('player count mismatch warning', () => {
        it('shows a mismatch warning when both teams have different player counts', async () => {
            setupGetMocks();

            const teams = [
                makeTeam(10, 'Team Alpha', [
                    { id: 1, user_id: null, display_name: 'Carlos' },
                    { id: 2, user_id: null, display_name: 'Diana' },
                ]),
                makeTeam(11, 'Team Beta', [
                    { id: 3, user_id: null, display_name: 'Eve' },
                ]),
            ];

            render(<TeamsCard initialTeams={teams} selectedGame={selectedGame} />);

            await screen.findByText('Team Alpha');

            expect(
                screen.getByRole('alert'),
            ).toBeInTheDocument();

            expect(
                screen.getByText(/Player count mismatch/i),
            ).toBeInTheDocument();

            expect(
                screen.getByText(/Team Alpha has 2 players, Team Beta has 1 player/i),
            ).toBeInTheDocument();
        });

        it('does not show a mismatch warning when both teams have the same player count', async () => {
            setupGetMocks();

            const teams = [
                makeTeam(10, 'Team Alpha', [
                    { id: 1, user_id: null, display_name: 'Carlos' },
                ]),
                makeTeam(11, 'Team Beta', [
                    { id: 2, user_id: null, display_name: 'Diana' },
                ]),
            ];

            render(<TeamsCard initialTeams={teams} selectedGame={selectedGame} />);

            await screen.findByText('Team Alpha');

            expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        });

        it('does not show a mismatch warning when both teams have zero players', async () => {
            setupGetMocks();

            const teams = [
                makeTeam(10, 'Team Alpha', []),
                makeTeam(11, 'Team Beta', []),
            ];

            render(<TeamsCard initialTeams={teams} selectedGame={selectedGame} />);

            await screen.findByText('Team Alpha');

            expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        });

        it('does not show a mismatch warning when only one team is present', async () => {
            setupGetMocks();

            render(
                <TeamsCard
                    initialTeams={[
                        makeTeam(10, 'Team Alpha', [
                            { id: 1, user_id: null, display_name: 'Carlos' },
                        ]),
                    ]}
                    selectedGame={selectedGame}
                />,
            );

            await screen.findByText('Team Alpha');

            expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        });

        it('uses singular "player" label when a team has exactly one player', async () => {
            setupGetMocks();

            const teams = [
                makeTeam(10, 'Team Alpha', [
                    { id: 1, user_id: null, display_name: 'Carlos' },
                ]),
                makeTeam(11, 'Team Beta', []),
            ];

            render(<TeamsCard initialTeams={teams} selectedGame={selectedGame} />);

            await screen.findByText('Team Alpha');

            expect(
                screen.getByText(/Team Alpha has 1 player, Team Beta has 0 players/i),
            ).toBeInTheDocument();
        });
    });

    describe('remove existing player in edit modal', () => {
        it('shows a remove button next to each existing player in edit mode', async () => {
            const team = makeTeam(10, 'Team Alpha', [
                { id: 1, user_id: null, display_name: 'Carlos' },
                { id: 2, user_id: null, display_name: 'Diana' },
            ]);
            setupGetMocks();

            render(<TeamsCard initialTeams={[team]} selectedGame={selectedGame} />);

            await screen.findByText('Team Alpha');
            await userEvent.click(screen.getByRole('button', { name: 'Edit team' }));

            expect(screen.getByRole('button', { name: 'Remove Carlos' })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Remove Diana' })).toBeInTheDocument();
        });

        it('hides a player row when their remove button is clicked', async () => {
            const team = makeTeam(10, 'Team Alpha', [
                { id: 1, user_id: null, display_name: 'Carlos' },
            ]);
            setupGetMocks();

            render(<TeamsCard initialTeams={[team]} selectedGame={selectedGame} />);

            await screen.findByText('Team Alpha');
            await userEvent.click(screen.getByRole('button', { name: 'Edit team' }));

            const dialog = screen.getByRole('dialog');
            expect(within(dialog).getByText('Carlos')).toBeInTheDocument();

            await userEvent.click(within(dialog).getByRole('button', { name: 'Remove Carlos' }));

            expect(within(dialog).queryByText('Carlos')).not.toBeInTheDocument();
        });

        it('hides the Current players section when all existing players are removed', async () => {
            const team = makeTeam(10, 'Team Alpha', [
                { id: 1, user_id: null, display_name: 'Carlos' },
            ]);
            setupGetMocks();

            render(<TeamsCard initialTeams={[team]} selectedGame={selectedGame} />);

            await screen.findByText('Team Alpha');
            await userEvent.click(screen.getByRole('button', { name: 'Edit team' }));

            expect(screen.getByText('Current players')).toBeInTheDocument();

            await userEvent.click(screen.getByRole('button', { name: 'Remove Carlos' }));

            expect(screen.queryByText('Current players')).not.toBeInTheDocument();
        });

        it('calls DELETE for each removed player when the edit form is submitted', async () => {
            const team = makeTeam(10, 'Team Alpha', [
                { id: 1, user_id: null, display_name: 'Carlos' },
                { id: 2, user_id: null, display_name: 'Diana' },
            ]);
            setupGetMocks();

            const updatedTeam = makeTeam(10, 'Team Alpha', []);
            axios.put.mockResolvedValueOnce(makeGameSummary([updatedTeam]));
            axios.delete
                .mockResolvedValueOnce(makeGameSummary([updatedTeam]))
                .mockResolvedValueOnce(makeGameSummary([updatedTeam]));

            render(<TeamsCard initialTeams={[team]} selectedGame={selectedGame} />);

            await screen.findByText('Team Alpha');
            await userEvent.click(screen.getByRole('button', { name: 'Edit team' }));

            await userEvent.click(screen.getByRole('button', { name: 'Remove Carlos' }));
            await userEvent.click(screen.getByRole('button', { name: 'Remove Diana' }));

            await userEvent.click(screen.getByRole('button', { name: 'Update team' }));

            await waitFor(() =>
                expect(axios.delete).toHaveBeenCalledWith(
                    '/api/v1/games/5/teams/10/players/1',
                ),
            );

            await waitFor(() =>
                expect(axios.delete).toHaveBeenCalledWith(
                    '/api/v1/games/5/teams/10/players/2',
                ),
            );

            expect(axios.delete).toHaveBeenCalledTimes(2);
        });

        it('calls DELETE for removed players before adding new ones on submit', async () => {
            const team = makeTeam(10, 'Team Alpha', [
                { id: 1, user_id: null, display_name: 'Carlos' },
            ]);
            setupGetMocks();

            const interimTeam = makeTeam(10, 'Team Alpha', []);
            const finalTeam   = makeTeam(10, 'Team Alpha', [{ id: 3, user_id: null, display_name: 'Elena' }]);
            axios.put.mockResolvedValueOnce(makeGameSummary([interimTeam]));
            axios.delete.mockResolvedValueOnce(makeGameSummary([interimTeam]));
            axios.post.mockResolvedValueOnce(makeGameSummary([finalTeam]));

            render(<TeamsCard initialTeams={[team]} selectedGame={selectedGame} />);

            await screen.findByText('Team Alpha');
            await userEvent.click(screen.getByRole('button', { name: 'Edit team' }));

            await userEvent.click(screen.getByRole('button', { name: 'Remove Carlos' }));
            await userEvent.type(screen.getByLabelText('Player name'), 'Elena');
            await userEvent.click(screen.getByRole('button', { name: 'Add player' }));

            await userEvent.click(screen.getByRole('button', { name: 'Update team' }));

            await waitFor(() => expect(axios.delete).toHaveBeenCalledTimes(1));
            await waitFor(() => expect(axios.post).toHaveBeenCalledWith(
                '/api/v1/games/5/teams/10/players',
                { name: 'Elena' },
            ));
        });

        it('does not call DELETE when no existing players are removed on submit', async () => {
            const team = makeTeam(10, 'Team Alpha', [
                { id: 1, user_id: null, display_name: 'Carlos' },
            ]);
            setupGetMocks();

            const updatedTeam = makeTeam(10, 'Team Alpha Updated', [
                { id: 1, user_id: null, display_name: 'Carlos' },
            ]);
            axios.put.mockResolvedValueOnce(makeGameSummary([updatedTeam]));

            render(<TeamsCard initialTeams={[team]} selectedGame={selectedGame} />);

            await screen.findByText('Team Alpha');
            await userEvent.click(screen.getByRole('button', { name: 'Edit team' }));

            const nameInput = screen.getByLabelText('Team name');
            await userEvent.clear(nameInput);
            await userEvent.type(nameInput, 'Team Alpha Updated');

            await userEvent.click(screen.getByRole('button', { name: 'Update team' }));

            await waitFor(() => expect(screen.getByText('Team Alpha Updated')).toBeInTheDocument());
            expect(axios.delete).not.toHaveBeenCalled();
        });

        it('allows adding an existing player name again once they have been removed', async () => {
            const team = makeTeam(10, 'Team Alpha', [
                { id: 1, user_id: null, display_name: 'Carlos' },
            ]);
            setupGetMocks();

            render(<TeamsCard initialTeams={[team]} selectedGame={selectedGame} />);

            await screen.findByText('Team Alpha');
            await userEvent.click(screen.getByRole('button', { name: 'Edit team' }));

            const dialog = screen.getByRole('dialog');

            // Removing Carlos means his name is no longer a duplicate in the pending list.
            await userEvent.click(within(dialog).getByRole('button', { name: 'Remove Carlos' }));

            await userEvent.type(screen.getByLabelText('Player name'), 'Carlos');
            await userEvent.click(screen.getByRole('button', { name: 'Add player' }));

            expect(screen.queryByText('A player with this name already exists in this team.')).not.toBeInTheDocument();
            expect(within(dialog).getAllByText('Carlos').length).toBeGreaterThanOrEqual(1);
        });

        it('resets removed player state when the modal is closed and reopened', async () => {
            const team = makeTeam(10, 'Team Alpha', [
                { id: 1, user_id: null, display_name: 'Carlos' },
            ]);
            setupGetMocks();

            render(<TeamsCard initialTeams={[team]} selectedGame={selectedGame} />);

            await screen.findByText('Team Alpha');
            await userEvent.click(screen.getByRole('button', { name: 'Edit team' }));

            let dialog = screen.getByRole('dialog');
            await userEvent.click(within(dialog).getByRole('button', { name: 'Remove Carlos' }));
            expect(within(dialog).queryByText('Carlos')).not.toBeInTheDocument();

            // Close and reopen the modal.
            await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
            await userEvent.click(screen.getByRole('button', { name: 'Edit team' }));

            // Carlos should be visible again with its remove button.
            dialog = screen.getByRole('dialog');
            expect(within(dialog).getByText('Carlos')).toBeInTheDocument();
            expect(within(dialog).getByRole('button', { name: 'Remove Carlos' })).toBeInTheDocument();
        });
    });
});
