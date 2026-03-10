import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';
import RoundsCard from '@/Components/RoundsCard';

vi.mock('axios');

const selectedGame = { id: 5, name: 'Friday Table', target_points: 2000 };

const makeGameResponse = (teams = [], rounds = []) => ({
    data: {
        data: {
            game: {
                game: { id: 5, name: 'Friday Table', target_points: 2000, status: 'in_progress' },
                teams,
                rounds,
            },
        },
    },
});

const teamA = { id: 10, name: 'Team Alpha', current_score: 0, players: [] };
const teamB = { id: 11, name: 'Team Beta', current_score: 0, players: [] };

const round1 = {
    round_number: 1,
    scores: [
        { team_id: 10, team_name: 'Team Alpha', points: 800 },
        { team_id: 11, team_name: 'Team Beta', points: 500 },
    ],
};

describe('RoundsCard', () => {
    beforeEach(() => vi.resetAllMocks());

    it('shows a placeholder when no game is selected', () => {
        render(<RoundsCard selectedGame={null} />);

        expect(screen.getByText('Select a game above to record rounds.')).toBeInTheDocument();
    });

    it('shows a message when fewer than two teams are configured', async () => {
        render(<RoundsCard initialTeams={[teamA]} initialRounds={[]} selectedGame={selectedGame} />);

        await screen.findByText('Add both teams before recording rounds.');
    });

    it('shows score inputs labeled with each team name when two teams exist', async () => {
        render(<RoundsCard initialTeams={[teamA, teamB]} initialRounds={[]} selectedGame={selectedGame} />);

        await screen.findByLabelText('Team Alpha');
        expect(screen.getByLabelText('Team Beta')).toBeInTheDocument();
    });

    it('shows "no rounds yet" when the rounds array is empty', async () => {
        render(<RoundsCard initialTeams={[teamA, teamB]} initialRounds={[]} selectedGame={selectedGame} />);

        await screen.findByText('No rounds recorded yet.');
    });

    it('renders completed rounds in the history table', async () => {
        render(<RoundsCard initialTeams={[teamA, teamB]} initialRounds={[round1]} selectedGame={selectedGame} />);

        await screen.findByText('1');
        expect(screen.getByText('800')).toBeInTheDocument();
        expect(screen.getByText('500')).toBeInTheDocument();
    });

    it('shows the correct next round number based on history length', async () => {
        render(<RoundsCard initialTeams={[teamA, teamB]} initialRounds={[round1]} selectedGame={selectedGame} />);

        await screen.findByText('Round 2');
    });

    it('shows validation errors when submitting with empty score inputs', async () => {
        render(<RoundsCard initialTeams={[teamA, teamB]} initialRounds={[]} selectedGame={selectedGame} />);

        await screen.findByLabelText('Team Alpha');
        await userEvent.click(screen.getByRole('button', { name: 'Record Round' }));

        await waitFor(() =>
            expect(screen.getAllByText('Score is required.').length).toBeGreaterThanOrEqual(1),
        );
        expect(axios.post).not.toHaveBeenCalled();
    });

    it('records a round and updates the history table', async () => {
        const updatedTeamA = { ...teamA, current_score: 800 };
        const updatedTeamB = { ...teamB, current_score: 500 };
        axios.post.mockResolvedValueOnce(
            makeGameResponse([updatedTeamA, updatedTeamB], [round1]),
        );

        render(<RoundsCard initialTeams={[teamA, teamB]} initialRounds={[]} selectedGame={selectedGame} />);

        await screen.findByLabelText('Team Alpha');
        await userEvent.type(screen.getByLabelText('Team Alpha'), '800');
        await userEvent.type(screen.getByLabelText('Team Beta'), '500');
        await userEvent.click(screen.getByRole('button', { name: 'Record Round' }));

        await waitFor(() =>
            expect(axios.post).toHaveBeenCalledWith('/api/v1/games/5/rounds', {
                scores: [
                    { team_id: 10, points: 800 },
                    { team_id: 11, points: 500 },
                ],
            }),
        );

        await screen.findByText('800');
    });

    it('clears the score inputs after a successful submission', async () => {
        axios.post.mockResolvedValueOnce(makeGameResponse([teamA, teamB], [round1]));

        render(<RoundsCard initialTeams={[teamA, teamB]} initialRounds={[]} selectedGame={selectedGame} />);

        await screen.findByLabelText('Team Alpha');
        await userEvent.type(screen.getByLabelText('Team Alpha'), '800');
        await userEvent.type(screen.getByLabelText('Team Beta'), '500');
        await userEvent.click(screen.getByRole('button', { name: 'Record Round' }));

        await waitFor(() =>
            expect(screen.getByLabelText('Team Alpha')).toHaveValue(null),
        );
        expect(screen.getByLabelText('Team Beta')).toHaveValue(null);
    });

    it('calls onRoundRecorded callback with updated teams after a successful round submission', async () => {
        const updatedTeamA = { ...teamA, current_score: 800 };
        const updatedTeamB = { ...teamB, current_score: 500 };
        axios.post.mockResolvedValueOnce(
            makeGameResponse([updatedTeamA, updatedTeamB], [round1]),
        );

        const onRoundRecorded = vi.fn();

        render(<RoundsCard initialTeams={[teamA, teamB]} initialRounds={[]} onRoundRecorded={onRoundRecorded} selectedGame={selectedGame} />);

        await screen.findByLabelText('Team Alpha');
        await userEvent.type(screen.getByLabelText('Team Alpha'), '800');
        await userEvent.type(screen.getByLabelText('Team Beta'), '500');
        await userEvent.click(screen.getByRole('button', { name: 'Record Round' }));

        await waitFor(() =>
            expect(onRoundRecorded).toHaveBeenCalledWith([updatedTeamA, updatedTeamB]),
        );
    });

    it('does not call onRoundRecorded when the API call fails', async () => {
        axios.post.mockRejectedValueOnce(new Error('Network error'));

        const onRoundRecorded = vi.fn();

        render(<RoundsCard initialTeams={[teamA, teamB]} initialRounds={[]} onRoundRecorded={onRoundRecorded} selectedGame={selectedGame} />);

        await screen.findByLabelText('Team Alpha');
        await userEvent.type(screen.getByLabelText('Team Alpha'), '800');
        await userEvent.type(screen.getByLabelText('Team Beta'), '500');
        await userEvent.click(screen.getByRole('button', { name: 'Record Round' }));

        await screen.findByText('Unable to record the round right now.');
        expect(onRoundRecorded).not.toHaveBeenCalled();
    });
});
