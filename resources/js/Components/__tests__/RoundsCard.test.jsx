import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';
import RoundsCard from '@/Components/RoundsCard';

vi.mock('axios');

const selectedGame = { id: 5, name: 'Friday Table', target_points: 2000 };

const baseElements = [
    { id: 1, name: 'burako', label: 'Burako', points: 100, input_type: 'boolean' },
    { id: 2, name: 'clean_canastra', label: 'Clean Canastra', points: 200, input_type: 'quantity' },
];

const elementsResponse = { data: { data: { base_elements: baseElements } } };

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
        { team_id: 10, team_name: 'Team Alpha', points: 100 },
        { team_id: 11, team_name: 'Team Beta', points: 400 },
    ],
};

describe('RoundsCard', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        // Each test gets a working base-elements GET response so the form renders
        axios.get.mockResolvedValue(elementsResponse);
    });

    it('shows a placeholder when no game is selected', () => {
        render(<RoundsCard selectedGame={null} />);

        expect(screen.getByText('Select a game above to record rounds.')).toBeInTheDocument();
    });

    it('shows a message when fewer than two teams are configured', async () => {
        render(<RoundsCard initialTeams={[teamA]} initialRounds={[]} selectedGame={selectedGame} />);

        await screen.findByText('Add both teams before recording rounds.');
    });

    it('shows team name headings when two teams exist', async () => {
        render(<RoundsCard initialTeams={[teamA, teamB]} initialRounds={[]} selectedGame={selectedGame} />);

        await screen.findByText('Team Alpha');
        expect(screen.getByText('Team Beta')).toBeInTheDocument();
    });

    it('renders a checkbox for each boolean base element per team', async () => {
        render(<RoundsCard initialTeams={[teamA, teamB]} initialRounds={[]} selectedGame={selectedGame} />);

        // Both teams render one Burako checkbox each
        const burakoCheckboxes = await screen.findAllByLabelText('Burako');

        expect(burakoCheckboxes).toHaveLength(2);
        expect(burakoCheckboxes[0]).toHaveAttribute('type', 'checkbox');
    });

    it('renders a number input for each quantity base element per team', async () => {
        render(<RoundsCard initialTeams={[teamA, teamB]} initialRounds={[]} selectedGame={selectedGame} />);

        const canInputs = await screen.findAllByLabelText('Clean Canastra');

        expect(canInputs).toHaveLength(2);
        expect(canInputs[0]).toHaveAttribute('type', 'number');
    });

    it('shows "no rounds yet" when the rounds array is empty', async () => {
        render(<RoundsCard initialTeams={[teamA, teamB]} initialRounds={[]} selectedGame={selectedGame} />);

        await screen.findByText('No rounds recorded yet.');
    });

    it('renders completed rounds in the history table', async () => {
        render(<RoundsCard initialTeams={[teamA, teamB]} initialRounds={[round1]} selectedGame={selectedGame} />);

        await screen.findByText('1');
        expect(screen.getByText('100')).toBeInTheDocument();
        expect(screen.getByText('400')).toBeInTheDocument();
    });

    it('shows the correct next round number based on history length', async () => {
        render(<RoundsCard initialTeams={[teamA, teamB]} initialRounds={[round1]} selectedGame={selectedGame} />);

        await screen.findByText('Round 2');
    });

    it('records a round with scores computed from base element inputs', async () => {
        const updatedTeamA = { ...teamA, current_score: 100 };
        const updatedTeamB = { ...teamB, current_score: 400 };
        axios.post.mockResolvedValueOnce(
            makeGameResponse([updatedTeamA, updatedTeamB], [round1]),
        );

        render(<RoundsCard initialTeams={[teamA, teamB]} initialRounds={[]} selectedGame={selectedGame} />);

        // Wait for base elements to render
        const burakoCheckboxes = await screen.findAllByLabelText('Burako');
        const canInputs = await screen.findAllByLabelText('Clean Canastra');

        // Team Alpha: check Burako → 100 pts
        await userEvent.click(burakoCheckboxes[0]);
        // Team Beta: enter 2 Clean Canastra → 2 × 200 = 400 pts
        await userEvent.clear(canInputs[1]);
        await userEvent.type(canInputs[1], '2');

        await userEvent.click(screen.getByRole('button', { name: 'Record Round' }));

        await waitFor(() =>
            expect(axios.post).toHaveBeenCalledWith('/api/v1/games/5/rounds', {
                scores: [
                    { team_id: 10, points: 100 },
                    { team_id: 11, points: 400 },
                ],
            }),
        );

        await screen.findByText('100');
    });

    it('resets base element inputs to defaults after a successful round submission', async () => {
        axios.post.mockResolvedValueOnce(makeGameResponse([teamA, teamB], [round1]));

        render(<RoundsCard initialTeams={[teamA, teamB]} initialRounds={[]} selectedGame={selectedGame} />);

        const burakoCheckboxes = await screen.findAllByLabelText('Burako');
        // Check Burako for Team Alpha
        await userEvent.click(burakoCheckboxes[0]);
        expect(burakoCheckboxes[0]).toBeChecked();

        await userEvent.click(screen.getByRole('button', { name: 'Record Round' }));

        await waitFor(() => expect(burakoCheckboxes[0]).not.toBeChecked());
    });

    it('calls onRoundRecorded callback with updated teams after a successful round submission', async () => {
        const updatedTeamA = { ...teamA, current_score: 100 };
        const updatedTeamB = { ...teamB, current_score: 0 };
        axios.post.mockResolvedValueOnce(
            makeGameResponse([updatedTeamA, updatedTeamB], [round1]),
        );

        const onRoundRecorded = vi.fn();

        render(
            <RoundsCard
                initialTeams={[teamA, teamB]}
                initialRounds={[]}
                onRoundRecorded={onRoundRecorded}
                selectedGame={selectedGame}
            />,
        );

        await screen.findAllByLabelText('Burako');
        await userEvent.click(screen.getByRole('button', { name: 'Record Round' }));

        await waitFor(() =>
            expect(onRoundRecorded).toHaveBeenCalledWith([updatedTeamA, updatedTeamB]),
        );
    });

    it('shows a save error and does not call onRoundRecorded when the API call fails', async () => {
        axios.post.mockRejectedValueOnce(new Error('Network error'));

        const onRoundRecorded = vi.fn();

        render(
            <RoundsCard
                initialTeams={[teamA, teamB]}
                initialRounds={[]}
                onRoundRecorded={onRoundRecorded}
                selectedGame={selectedGame}
            />,
        );

        await screen.findAllByLabelText('Burako');
        await userEvent.click(screen.getByRole('button', { name: 'Record Round' }));

        await screen.findByText('Unable to record the round right now.');
        expect(onRoundRecorded).not.toHaveBeenCalled();
    });

    it('shows a validation error and blocks submission when a quantity input is a decimal', async () => {
        render(<RoundsCard initialTeams={[teamA, teamB]} initialRounds={[]} selectedGame={selectedGame} />);

        const canInputs = await screen.findAllByLabelText('Clean Canastra');
        // JSDOM sanitises <input type="number"> values through the DOM setter, so
        // assigning via { target: { value } } would produce '' for a step=1 input.
        // Override the value descriptor on the instance so React reads '1.5'.
        Object.defineProperty(canInputs[0], 'value', {
            configurable: true,
            writable: true,
            value: '1.5',
        });
        fireEvent.input(canInputs[0]);

        await userEvent.click(screen.getByRole('button', { name: 'Record Round' }));

        await waitFor(() =>
            expect(screen.getByText('Clean Canastra must be a whole number ≥ 0.')).toBeInTheDocument(),
        );
        expect(axios.post).not.toHaveBeenCalled();
    });

    it('renders cards in hand and cards on table inputs for each team', async () => {
        render(<RoundsCard initialTeams={[teamA, teamB]} initialRounds={[]} selectedGame={selectedGame} />);

        const inHandInputs = await screen.findAllByLabelText('Cards in Hand');
        const onTableInputs = screen.getAllByLabelText('Cards on Table');

        expect(inHandInputs).toHaveLength(2);
        expect(onTableInputs).toHaveLength(2);
        expect(inHandInputs[0]).toHaveAttribute('type', 'number');
        expect(onTableInputs[0]).toHaveAttribute('type', 'number');
    });

    it('subtracts cards in hand and adds cards on table when computing the submitted score', async () => {
        // Team Alpha: Burako (100) − cardsInHand (40) = 60
        // Team Beta:  2 Clean Canastra (400) + cardsOnTable (50) = 450
        const updatedTeamA = { ...teamA, current_score: 60 };
        const updatedTeamB = { ...teamB, current_score: 450 };
        axios.post.mockResolvedValueOnce(
            makeGameResponse([updatedTeamA, updatedTeamB], [round1]),
        );

        render(<RoundsCard initialTeams={[teamA, teamB]} initialRounds={[]} selectedGame={selectedGame} />);

        const burakoCheckboxes = await screen.findAllByLabelText('Burako');
        const canInputs = screen.getAllByLabelText('Clean Canastra');
        const inHandInputs = screen.getAllByLabelText('Cards in Hand');
        const onTableInputs = screen.getAllByLabelText('Cards on Table');

        // Team Alpha: check Burako
        await userEvent.click(burakoCheckboxes[0]);
        // Team Alpha: cards in hand = 40
        await userEvent.clear(inHandInputs[0]);
        await userEvent.type(inHandInputs[0], '40');
        // Team Beta: 2 Clean Canastra
        await userEvent.clear(canInputs[1]);
        await userEvent.type(canInputs[1], '2');
        // Team Beta: cards on table = 50
        await userEvent.clear(onTableInputs[1]);
        await userEvent.type(onTableInputs[1], '50');

        await userEvent.click(screen.getByRole('button', { name: 'Record Round' }));

        await waitFor(() =>
            expect(axios.post).toHaveBeenCalledWith('/api/v1/games/5/rounds', {
                scores: [
                    { team_id: 10, points: 60 },
                    { team_id: 11, points: 450 },
                ],
            }),
        );
    });

    it('resets card inputs to zero after a successful round submission', async () => {
        axios.post.mockResolvedValueOnce(makeGameResponse([teamA, teamB], [round1]));

        render(<RoundsCard initialTeams={[teamA, teamB]} initialRounds={[]} selectedGame={selectedGame} />);

        const inHandInputs = await screen.findAllByLabelText('Cards in Hand');
        await userEvent.clear(inHandInputs[0]);
        await userEvent.type(inHandInputs[0], '25');
        expect(inHandInputs[0]).toHaveValue(25);

        await userEvent.click(screen.getByRole('button', { name: 'Record Round' }));

        await waitFor(() => expect(inHandInputs[0]).toHaveValue(0));
    });

    it('shows a validation error and blocks submission when cards in hand is a decimal', async () => {
        render(<RoundsCard initialTeams={[teamA, teamB]} initialRounds={[]} selectedGame={selectedGame} />);

        const inHandInputs = await screen.findAllByLabelText('Cards in Hand');
        Object.defineProperty(inHandInputs[0], 'value', {
            configurable: true,
            writable: true,
            value: '2.5',
        });
        fireEvent.input(inHandInputs[0]);

        await userEvent.click(screen.getByRole('button', { name: 'Record Round' }));

        await waitFor(() =>
            expect(screen.getByText('Cards in hand must be a whole number ≥ 0.')).toBeInTheDocument(),
        );
        expect(axios.post).not.toHaveBeenCalled();
    });

    it('shows a validation error and blocks submission when cards on table is a decimal', async () => {
        render(<RoundsCard initialTeams={[teamA, teamB]} initialRounds={[]} selectedGame={selectedGame} />);

        const onTableInputs = await screen.findAllByLabelText('Cards on Table');
        Object.defineProperty(onTableInputs[0], 'value', {
            configurable: true,
            writable: true,
            value: '1.7',
        });
        fireEvent.input(onTableInputs[0]);

        await userEvent.click(screen.getByRole('button', { name: 'Record Round' }));

        await waitFor(() =>
            expect(screen.getByText('Cards on table must be a whole number ≥ 0.')).toBeInTheDocument(),
        );
        expect(axios.post).not.toHaveBeenCalled();
    });

    it('subtracts both cardsInHand and cardsOnTable from base points when a score_override element is checked', async () => {
        const overrideEl = { id: 3, name: 'penalty_element', label: 'Penalty Element', points: 0, input_type: 'boolean', score_override: true };
        const extendedElements = [...baseElements, overrideEl];
        axios.get.mockResolvedValue({ data: { data: { base_elements: extendedElements } } });
        axios.post.mockResolvedValueOnce(makeGameResponse([teamA, teamB], [round1]));

        render(<RoundsCard initialTeams={[teamA, teamB]} initialRounds={[]} selectedGame={selectedGame} />);

        // Check the score_override element for Team Alpha
        const overrideCheckboxes = await screen.findAllByLabelText('Penalty Element');
        await userEvent.click(overrideCheckboxes[0]);

        // Set cardsInHand = 60 and cardsOnTable = 100 for Team Alpha (both subtracted from base)
        const inHandInputs = screen.getAllByLabelText('Cards in Hand');
        const onTableInputs = screen.getAllByLabelText('Cards on Table');
        await userEvent.clear(inHandInputs[0]);
        await userEvent.type(inHandInputs[0], '60');
        await userEvent.clear(onTableInputs[0]);
        await userEvent.type(onTableInputs[0], '100');

        // Also check Burako (100) for Team Alpha — counts toward base score
        const burakoCheckboxes = screen.getAllByLabelText('Burako');
        await userEvent.click(burakoCheckboxes[0]);

        await userEvent.click(screen.getByRole('button', { name: 'Record Round' }));

        // Burako(100) + overrideEl(0) - cardsInHand(60) - cardsOnTable(100) = -60
        await waitFor(() =>
            expect(axios.post).toHaveBeenCalledWith('/api/v1/games/5/rounds', {
                scores: [
                    { team_id: 10, points: -60 },
                    { team_id: 11, points: 0 },
                ],
            }),
        );
    });

    it('subtracts cards on table when all canastras are zero', async () => {
        // Team Alpha: Burako (100) − cardsOnTable (30) = 70 (no canastra scored → onTable subtracted)
        // Team Beta:  2 Clean Canastra (400) + cardsOnTable (50) = 450 (canastra scored → added)
        const updatedTeamA = { ...teamA, current_score: 70 };
        const updatedTeamB = { ...teamB, current_score: 450 };
        axios.post.mockResolvedValueOnce(
            makeGameResponse([updatedTeamA, updatedTeamB], [round1]),
        );

        render(<RoundsCard initialTeams={[teamA, teamB]} initialRounds={[]} selectedGame={selectedGame} />);

        const burakoCheckboxes = await screen.findAllByLabelText('Burako');
        const canInputs = screen.getAllByLabelText('Clean Canastra');
        const onTableInputs = screen.getAllByLabelText('Cards on Table');

        // Team Alpha: Burako + cardsOnTable=30, no canastra → onTable subtracted: 100 − 30 = 70
        await userEvent.click(burakoCheckboxes[0]);
        await userEvent.clear(onTableInputs[0]);
        await userEvent.type(onTableInputs[0], '30');

        // Team Beta: 2 Clean Canastra + cardsOnTable=50 → canastra scored → onTable added: 400 + 50 = 450
        await userEvent.clear(canInputs[1]);
        await userEvent.type(canInputs[1], '2');
        await userEvent.clear(onTableInputs[1]);
        await userEvent.type(onTableInputs[1], '50');

        await userEvent.click(screen.getByRole('button', { name: 'Record Round' }));

        await waitFor(() =>
            expect(axios.post).toHaveBeenCalledWith('/api/v1/games/5/rounds', {
                scores: [
                    { team_id: 10, points: 70 },
                    { team_id: 11, points: 450 },
                ],
            }),
        );
    });

    it('unchecks a mutually-exclusive boolean for other teams when checked for one team', async () => {
        const mutualEl = { id: 3, name: 'clean_cut', label: 'Clean Cut', points: 100, input_type: 'boolean', mutually_exclusive: true };
        axios.get.mockResolvedValue({ data: { data: { base_elements: [...baseElements, mutualEl] } } });

        render(<RoundsCard initialTeams={[teamA, teamB]} initialRounds={[]} selectedGame={selectedGame} />);

        const cleanCutCheckboxes = await screen.findAllByLabelText('Clean Cut');
        expect(cleanCutCheckboxes).toHaveLength(2);

        // Check Clean Cut for Team Beta (index 1)
        await userEvent.click(cleanCutCheckboxes[1]);
        expect(cleanCutCheckboxes[1]).toBeChecked();

        // Now check Clean Cut for Team Alpha (index 0) — should uncheck Team Beta
        await userEvent.click(cleanCutCheckboxes[0]);
        expect(cleanCutCheckboxes[0]).toBeChecked();
        expect(cleanCutCheckboxes[1]).not.toBeChecked();
    });

    it('does not affect other teams when a non-mutually-exclusive boolean is checked', async () => {
        render(<RoundsCard initialTeams={[teamA, teamB]} initialRounds={[]} selectedGame={selectedGame} />);

        const burakoCheckboxes = await screen.findAllByLabelText('Burako');

        // Check Burako for Team Alpha — Team Beta Burako should remain unchecked (independent)
        await userEvent.click(burakoCheckboxes[0]);
        expect(burakoCheckboxes[0]).toBeChecked();
        expect(burakoCheckboxes[1]).not.toBeChecked();

        // Also check Burako for Team Beta — both can be checked simultaneously
        await userEvent.click(burakoCheckboxes[1]);
        expect(burakoCheckboxes[0]).toBeChecked();
        expect(burakoCheckboxes[1]).toBeChecked();
    });
});

