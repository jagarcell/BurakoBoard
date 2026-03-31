import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import api from '@/api/client';
import AddEditTeamModal from '@/Components/AddEditTeamModal';

vi.mock('@/api/client', () => ({
    default: {
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
    },
}));

const selectedGame = { id: 3, name: 'Test Game' };

const baseProps = {
    isOpen: true,
    onClose: vi.fn(),
    selectedGame,
    editingTeam: null,
    creatingSlot: null,
    allTeams: [],
    existingTeams: [],
    users: [],
    onTeamsChange: vi.fn(),
    onTeamCreated: vi.fn(),
};

const makeCreateResponse = (name = 'Team Alpha') => ({
    data: {
        data: {
            game: {
                teams: [{ id: 99, name }],
            },
        },
    },
});

const makeEditResponse = (teams = []) => ({
    data: { data: { game: { teams } } },
});

describe('AddEditTeamModal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('does not render when isOpen is false', () => {
        render(<AddEditTeamModal {...baseProps} isOpen={false} />);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('shows "Create a team" heading when editingTeam is null', () => {
        render(<AddEditTeamModal {...baseProps} />);
        expect(screen.getByText('Create a team')).toBeInTheDocument();
    });

    it('shows "Edit team" heading when editingTeam is provided', () => {
        const editingTeam = { id: 10, name: 'Team Alpha', players: [] };
        render(<AddEditTeamModal {...baseProps} editingTeam={editingTeam} />);
        expect(screen.getByText('Edit team')).toBeInTheDocument();
    });

    it('pre-fills the name input when editing', () => {
        const editingTeam = { id: 10, name: 'Alpha Team', players: [] };
        render(<AddEditTeamModal {...baseProps} editingTeam={editingTeam} />);
        expect(screen.getByDisplayValue('Alpha Team')).toBeInTheDocument();
    });

    it('shows a required error when submitting with an empty name', async () => {
        render(<AddEditTeamModal {...baseProps} />);
        await act(async () => {
            fireEvent.submit(document.querySelector('form'));
        });
        expect(screen.getByText(/a team name is required/i)).toBeInTheDocument();
    });

    it('shows a duplicate name error when the name matches an existing team', async () => {
        render(<AddEditTeamModal {...baseProps} allTeams={[{ id: 5, name: 'Existing Team' }]} />);
        fireEvent.change(screen.getByLabelText(/team name/i), { target: { value: 'Existing Team' } });
        await act(async () => {
            fireEvent.submit(document.querySelector('form'));
        });
        expect(screen.getByText(/a team with this name already exists/i)).toBeInTheDocument();
    });

    it('allows a team to keep its own name when editing', async () => {
        api.put.mockResolvedValue(makeEditResponse([{ id: 10, name: 'Alpha Team' }]));
        const editingTeam = { id: 10, name: 'Alpha Team', players: [] };
        render(
            <AddEditTeamModal
                {...baseProps}
                editingTeam={editingTeam}
                existingTeams={[{ id: 10, name: 'Alpha Team' }]}
            />,
        );
        await act(async () => {
            fireEvent.submit(document.querySelector('form'));
        });
        expect(api.put).toHaveBeenCalled();
        expect(screen.queryByText(/already exists/i)).not.toBeInTheDocument();
    });

    it('posts to create a team when there is no editingTeam', async () => {
        api.post.mockResolvedValue(makeCreateResponse('New Team'));
        render(<AddEditTeamModal {...baseProps} />);
        fireEvent.change(screen.getByLabelText(/team name/i), { target: { value: 'New Team' } });
        await act(async () => {
            fireEvent.submit(document.querySelector('form'));
        });
        expect(api.post).toHaveBeenCalledWith(
            `/games/${selectedGame.id}/teams`,
            { name: 'New Team' },
        );
    });

    it('calls onTeamsChange with the returned teams after create', async () => {
        const teams = [{ id: 99, name: 'New Team' }];
        api.post.mockResolvedValue(makeCreateResponse('New Team'));
        render(<AddEditTeamModal {...baseProps} />);
        fireEvent.change(screen.getByLabelText(/team name/i), { target: { value: 'New Team' } });
        await act(async () => {
            fireEvent.submit(document.querySelector('form'));
        });
        await waitFor(() => expect(baseProps.onTeamsChange).toHaveBeenCalledWith(teams));
    });

    it('calls onClose after a successful create', async () => {
        api.post.mockResolvedValue(makeCreateResponse('New Team'));
        render(<AddEditTeamModal {...baseProps} />);
        fireEvent.change(screen.getByLabelText(/team name/i), { target: { value: 'New Team' } });
        await act(async () => {
            fireEvent.submit(document.querySelector('form'));
        });
        await waitFor(() => expect(baseProps.onClose).toHaveBeenCalled());
    });

    it('sends PUT to the batch endpoint when editing a team', async () => {
        api.put.mockResolvedValue(makeEditResponse([{ id: 10, name: 'Beta Team' }]));
        const editingTeam = { id: 10, name: 'Alpha Team', players: [] };
        render(<AddEditTeamModal {...baseProps} editingTeam={editingTeam} />);
        fireEvent.change(screen.getByLabelText(/team name/i), { target: { value: 'Beta Team' } });
        await act(async () => {
            fireEvent.submit(document.querySelector('form'));
        });
        expect(api.put).toHaveBeenCalledWith(
            `/games/${selectedGame.id}/teams/${editingTeam.id}/batch`,
            {
                name: 'Beta Team',
                remove_player_ids: [],
                add_players: [],
                seat_swaps: [],
            },
        );
    });

    it('renders existing players via SeatedPlayerList when editing', () => {
        const editingTeam = {
            id: 10,
            name: 'Alpha Team',
            players: [
                { id: 1, display_name: 'Alice', seat_number: 1 },
                { id: 2, display_name: 'Bob', seat_number: 3 },
            ],
        };
        render(<AddEditTeamModal {...baseProps} editingTeam={editingTeam} />);
        expect(screen.getByText('Alice')).toBeInTheDocument();
        expect(screen.getByText('Bob')).toBeInTheDocument();
    });

    it('adds a player to the pending list when "Add player" is clicked', async () => {
        render(<AddEditTeamModal {...baseProps} />);
        fireEvent.change(screen.getByLabelText(/player name/i), { target: { value: 'Charlie' } });
        fireEvent.click(screen.getByRole('button', { name: /add player/i }));
        await waitFor(() => expect(screen.getByText('Charlie')).toBeInTheDocument());
    });

    it('shows an error when trying to add a player with an empty name', async () => {
        render(<AddEditTeamModal {...baseProps} />);
        fireEvent.click(screen.getByRole('button', { name: /add player/i }));
        await waitFor(() => {
            expect(screen.getByText(/player name is required/i)).toBeInTheDocument();
        });
    });

    it('shows an error when adding a duplicate player name', async () => {
        render(<AddEditTeamModal {...baseProps} />);
        fireEvent.change(screen.getByLabelText(/player name/i), { target: { value: 'Alice' } });
        fireEvent.click(screen.getByRole('button', { name: /add player/i }));
        await waitFor(() => screen.getByText('Alice'));
        fireEvent.change(screen.getByLabelText(/player name/i), { target: { value: 'Alice' } });
        fireEvent.click(screen.getByRole('button', { name: /add player/i }));
        await waitFor(() => {
            expect(
                screen.getByText(/a player with this name already exists/i),
            ).toBeInTheDocument();
        });
    });

    it('removes a pending player when the × button is clicked', async () => {
        render(<AddEditTeamModal {...baseProps} />);
        fireEvent.change(screen.getByLabelText(/player name/i), { target: { value: 'Dave' } });
        fireEvent.click(screen.getByRole('button', { name: /add player/i }));
        await waitFor(() => screen.getByText('Dave'));
        fireEvent.click(screen.getByRole('button', { name: /remove dave/i }));
        await waitFor(() => expect(screen.queryByText('Dave')).not.toBeInTheDocument());
    });

    it('shows a general error message when the API call fails', async () => {
        api.post.mockRejectedValue({
            response: { data: { data: { errors: {} } } },
        });
        render(<AddEditTeamModal {...baseProps} />);
        fireEvent.change(screen.getByLabelText(/team name/i), { target: { value: 'New Team' } });
        await act(async () => {
            fireEvent.submit(document.querySelector('form'));
        });
        await waitFor(() => {
            expect(
                screen.getByText(/unable to save the team right now/i),
            ).toBeInTheDocument();
        });
    });

    it('shows "Create team" on the submit button when creating', () => {
        render(<AddEditTeamModal {...baseProps} />);
        expect(screen.getByRole('button', { name: /^create team$/i })).toBeInTheDocument();
    });

    it('shows "Update team" on the submit button when editing', () => {
        const editingTeam = { id: 10, name: 'Alpha Team', players: [] };
        render(<AddEditTeamModal {...baseProps} editingTeam={editingTeam} />);
        expect(screen.getByRole('button', { name: /^update team$/i })).toBeInTheDocument();
    });

    it('calls onClose when Cancel is clicked', () => {
        render(<AddEditTeamModal {...baseProps} />);
        fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
        expect(baseProps.onClose).toHaveBeenCalled();
    });

    it('calls onTeamCreated after creating a new team', async () => {
        api.post.mockResolvedValue(makeCreateResponse('New Team'));
        render(<AddEditTeamModal {...baseProps} />);
        fireEvent.change(screen.getByLabelText(/team name/i), { target: { value: 'New Team' } });
        await act(async () => {
            fireEvent.submit(document.querySelector('form'));
        });
        await waitFor(() => expect(baseProps.onTeamCreated).toHaveBeenCalled());
    });

    it('includes remove_player_ids in the batch payload when a player is marked for removal', async () => {
        const existingPlayer = { id: 5, display_name: 'Eve', seat_number: 1 };
        const editingTeam = { id: 10, name: 'Alpha Team', players: [existingPlayer] };
        api.put.mockResolvedValue(makeEditResponse([{ id: 10, name: 'Alpha Team' }]));
        render(<AddEditTeamModal {...baseProps} editingTeam={editingTeam} />);

        fireEvent.click(screen.getByRole('button', { name: /remove eve/i }));

        await act(async () => {
            fireEvent.submit(document.querySelector('form'));
        });

        expect(api.put).toHaveBeenCalledWith(
            `/games/${selectedGame.id}/teams/${editingTeam.id}/batch`,
            expect.objectContaining({ remove_player_ids: [5] }),
        );
    });

    it('includes add_players in the batch payload when a new player is added', async () => {
        const editingTeam = { id: 10, name: 'Alpha Team', players: [] };
        api.put.mockResolvedValue(makeEditResponse([{ id: 10, name: 'Alpha Team' }]));
        render(<AddEditTeamModal {...baseProps} editingTeam={editingTeam} />);

        fireEvent.change(screen.getByLabelText(/player name/i), { target: { value: 'Frank' } });
        fireEvent.click(screen.getByRole('button', { name: /add player/i }));
        await waitFor(() => screen.getByText('Frank'));

        await act(async () => {
            fireEvent.submit(document.querySelector('form'));
        });

        expect(api.put).toHaveBeenCalledWith(
            `/games/${selectedGame.id}/teams/${editingTeam.id}/batch`,
            expect.objectContaining({ add_players: [{ name: 'Frank' }] }),
        );
    });

    it('calls onTeamsChange with teams from the batch response', async () => {
        const editingTeam = { id: 10, name: 'Alpha Team', players: [] };
        const updatedTeams = [{ id: 10, name: 'Renamed Team' }];
        api.put.mockResolvedValue(makeEditResponse(updatedTeams));
        render(<AddEditTeamModal {...baseProps} editingTeam={editingTeam} />);
        fireEvent.change(screen.getByLabelText(/team name/i), { target: { value: 'Renamed Team' } });
        await act(async () => {
            fireEvent.submit(document.querySelector('form'));
        });
        await waitFor(() => expect(baseProps.onTeamsChange).toHaveBeenCalledWith(updatedTeams));
    });
});
