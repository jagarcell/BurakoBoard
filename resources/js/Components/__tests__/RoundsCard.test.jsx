import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';
import RoundsCard from '@/Components/RoundsCard';

vi.mock('axios');

const mockPlayWinnerSound = vi.fn();
const mockUnlockWinnerSound = vi.fn();
vi.mock('@/hooks/useWinnerSound', () => ({
    default: () => ({ unlock: mockUnlockWinnerSound, play: mockPlayWinnerSound }),
}));

const selectedGame = { id: 5, name: 'Friday Table', target_points: 2000 };

const baseElements = [
    { id: 1, name: 'burako', label: 'Burako', points: 100, input_type: 'boolean' },
    { id: 2, name: 'clean_canastra', label: 'Clean Canastra', points: 200, input_type: 'quantity' },
];

const elementsResponse = { data: { data: { base_elements: baseElements } } };

const makeGameResponse = (teams = [], rounds = [], gameStatus = 'in_progress') => ({
    data: {
        data: {
            game: {
                game: { id: 5, name: 'Friday Table', target_points: 2000, status: gameStatus },
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
        mockPlayWinnerSound.mockReset();
        mockUnlockWinnerSound.mockReset();
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
        expect(screen.getAllByText('100').length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText('400').length).toBeGreaterThanOrEqual(1);
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

        await screen.findAllByText('100');
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
            expect(onRoundRecorded).toHaveBeenCalledWith([updatedTeamA, updatedTeamB], 'in_progress'),
        );
    });

    it('calls onRoundRecorded callback with updated teams and finished status when the round ends the game', async () => {
        const updatedTeamA = { ...teamA, current_score: 2100 };
        const updatedTeamB = { ...teamB, current_score: 800 };
        axios.post.mockResolvedValueOnce(
            makeGameResponse([updatedTeamA, updatedTeamB], [round1], 'finished'),
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
            expect(onRoundRecorded).toHaveBeenCalledWith([updatedTeamA, updatedTeamB], 'finished'),
        );
    });

    it('plays the winner sound when the recorded round ends the game', async () => {
        const updatedTeamA = { ...teamA, current_score: 2100 };
        const updatedTeamB = { ...teamB, current_score: 800 };
        axios.post.mockResolvedValueOnce(
            makeGameResponse([updatedTeamA, updatedTeamB], [round1], 'finished'),
        );

        render(
            <RoundsCard
                initialTeams={[teamA, teamB]}
                initialRounds={[]}
                selectedGame={selectedGame}
            />,
        );

        await screen.findAllByLabelText('Burako');
        await userEvent.click(screen.getByRole('button', { name: 'Record Round' }));

        await waitFor(() => expect(mockPlayWinnerSound).toHaveBeenCalledTimes(1));
    });

    it('does not play the winner sound when the round does not end the game', async () => {
        const updatedTeamA = { ...teamA, current_score: 100 };
        const updatedTeamB = { ...teamB, current_score: 400 };
        axios.post.mockResolvedValueOnce(
            makeGameResponse([updatedTeamA, updatedTeamB], [round1], 'in_progress'),
        );

        render(
            <RoundsCard
                initialTeams={[teamA, teamB]}
                initialRounds={[]}
                selectedGame={selectedGame}
            />,
        );

        await screen.findAllByLabelText('Burako');
        await userEvent.click(screen.getByRole('button', { name: 'Record Round' }));

        await waitFor(() => expect(axios.post).toHaveBeenCalled());
        expect(mockPlayWinnerSound).not.toHaveBeenCalled();
    });

    it('calls unlockWinnerSound synchronously when the Record Round button is clicked', async () => {
        axios.post.mockResolvedValueOnce(makeGameResponse([teamA, teamB], [round1]));

        render(
            <RoundsCard
                initialTeams={[teamA, teamB]}
                initialRounds={[]}
                selectedGame={selectedGame}
            />,
        );

        await screen.findAllByLabelText('Burako');
        await userEvent.click(screen.getByRole('button', { name: 'Record Round' }));

        await waitFor(() => expect(axios.post).toHaveBeenCalled());
        expect(mockUnlockWinnerSound).toHaveBeenCalledTimes(1);
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

        const inHandInputs = await screen.findAllByLabelText('Points in Hand');
        const onTableInputs = screen.getAllByLabelText('Points on Table');

        expect(inHandInputs).toHaveLength(2);
        expect(onTableInputs).toHaveLength(2);
        expect(inHandInputs[0]).toHaveAttribute('type', 'number');
        expect(onTableInputs[0]).toHaveAttribute('type', 'number');
    });

    it('subtracts points in hand and adds points on table when computing the submitted score', async () => {
        // Team Alpha: Burako (100) − pointsInHand (40) = 60
        // Team Beta:  2 Clean Canastra (400) + cardsOnTable (50) = 450
        const updatedTeamA = { ...teamA, current_score: 60 };
        const updatedTeamB = { ...teamB, current_score: 450 };
        axios.post.mockResolvedValueOnce(
            makeGameResponse([updatedTeamA, updatedTeamB], [round1]),
        );

        render(<RoundsCard initialTeams={[teamA, teamB]} initialRounds={[]} selectedGame={selectedGame} />);

        const burakoCheckboxes = await screen.findAllByLabelText('Burako');
        const canInputs = screen.getAllByLabelText('Clean Canastra');
        const inHandInputs = screen.getAllByLabelText('Points in Hand');
        const onTableInputs = screen.getAllByLabelText('Points on Table');

        // Team Alpha: check Burako
        await userEvent.click(burakoCheckboxes[0]);
        // Team Alpha: points in hand = 40
        await userEvent.clear(inHandInputs[0]);
        await userEvent.type(inHandInputs[0], '40');
        // Team Beta: 2 Clean Canastra
        await userEvent.clear(canInputs[1]);
        await userEvent.type(canInputs[1], '2');
        // Team Beta: points on table = 50
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

        const inHandInputs = await screen.findAllByLabelText('Points in Hand');
        await userEvent.clear(inHandInputs[0]);
        await userEvent.type(inHandInputs[0], '25');
        expect(inHandInputs[0]).toHaveValue(25);

        await userEvent.click(screen.getByRole('button', { name: 'Record Round' }));

        await waitFor(() => expect(inHandInputs[0]).toHaveValue(0));
    });

    it('shows a validation error and blocks submission when cards in hand is a decimal', async () => {
        render(<RoundsCard initialTeams={[teamA, teamB]} initialRounds={[]} selectedGame={selectedGame} />);

        const inHandInputs = await screen.findAllByLabelText('Points in Hand');
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

    it('shows a validation error and blocks submission when points on table is a decimal', async () => {
        render(<RoundsCard initialTeams={[teamA, teamB]} initialRounds={[]} selectedGame={selectedGame} />);

        const onTableInputs = await screen.findAllByLabelText('Points on Table');
        Object.defineProperty(onTableInputs[0], 'value', {
            configurable: true,
            writable: true,
            value: '1.7',
        });
        fireEvent.input(onTableInputs[0]);

        await userEvent.click(screen.getByRole('button', { name: 'Record Round' }));

        await waitFor(() =>
            expect(screen.getByText('Points on table must be a whole number ≥ 0.')).toBeInTheDocument(),
        );
        expect(axios.post).not.toHaveBeenCalled();
    });

    it('subtracts both pointsInHand and pointsOnTable from base points when a score_override element is checked', async () => {
        const overrideEl = { id: 3, name: 'penalty_element', label: 'Penalty Element', points: 0, input_type: 'boolean', score_override: true };
        const extendedElements = [...baseElements, overrideEl];
        axios.get.mockResolvedValue({ data: { data: { base_elements: extendedElements } } });
        axios.post.mockResolvedValueOnce(makeGameResponse([teamA, teamB], [round1]));

        render(<RoundsCard initialTeams={[teamA, teamB]} initialRounds={[]} selectedGame={selectedGame} />);

        // Check the score_override element for Team Alpha
        const overrideCheckboxes = await screen.findAllByLabelText('Penalty Element');
        await userEvent.click(overrideCheckboxes[0]);

        // Set pointsInHand = 60 and pointsOnTable = 100 for Team Alpha (both subtracted from base)
        const inHandInputs = screen.getAllByLabelText('Points in Hand');
        const onTableInputs = screen.getAllByLabelText('Points on Table');
        await userEvent.clear(inHandInputs[0]);
        await userEvent.type(inHandInputs[0], '60');
        await userEvent.clear(onTableInputs[0]);
        await userEvent.type(onTableInputs[0], '100');

        // Also check Burako (100) for Team Alpha — counts toward base score
        const burakoCheckboxes = screen.getAllByLabelText('Burako');
        await userEvent.click(burakoCheckboxes[0]);

        await userEvent.click(screen.getByRole('button', { name: 'Record Round' }));

        // Burako(100) + overrideEl(0) - pointsInHand(60) - pointsOnTable(100) = -60
        await waitFor(() =>
            expect(axios.post).toHaveBeenCalledWith('/api/v1/games/5/rounds', {
                scores: [
                    { team_id: 10, points: -60 },
                    { team_id: 11, points: 0 },
                ],
            }),
        );
    });

    it('subtracts points on table when all canastras are zero', async () => {
        // Team Alpha: Burako (100) − pointsOnTable (30) = 70 (no canastra scored → onTable subtracted)
        // Team Beta:  2 Clean Canastra (400) + pointsOnTable (50) = 450 (canastra scored → added)
        const updatedTeamA = { ...teamA, current_score: 70 };
        const updatedTeamB = { ...teamB, current_score: 450 };
        axios.post.mockResolvedValueOnce(
            makeGameResponse([updatedTeamA, updatedTeamB], [round1]),
        );

        render(<RoundsCard initialTeams={[teamA, teamB]} initialRounds={[]} selectedGame={selectedGame} />);

        const burakoCheckboxes = await screen.findAllByLabelText('Burako');
        const canInputs = screen.getAllByLabelText('Clean Canastra');
        const onTableInputs = screen.getAllByLabelText('Points on Table');

        // Team Alpha: Burako + pointsOnTable=30, no canastra → onTable subtracted: 100 − 30 = 70
        await userEvent.click(burakoCheckboxes[0]);
        await userEvent.clear(onTableInputs[0]);
        await userEvent.type(onTableInputs[0], '30');

        // Team Beta: 2 Clean Canastra + pointsOnTable=50 → canastra scored → onTable added: 400 + 50 = 450
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

    it('subtracts element penalty from the submitted score when a boolean element with penalty is unchecked', async () => {
        const penalizedBurako = { id: 1, name: 'burako', label: 'Burako', points: 100, penalty: 100, input_type: 'boolean' };
        axios.get.mockResolvedValue({ data: { data: { base_elements: [penalizedBurako] } } });
        axios.post.mockResolvedValueOnce(makeGameResponse([teamA, teamB], []));

        render(<RoundsCard initialTeams={[teamA, teamB]} initialRounds={[]} selectedGame={selectedGame} />);

        // Leave Burako unchecked for both teams — penalty of -100 applies to each
        await screen.findAllByLabelText('Burako');
        await userEvent.click(screen.getByRole('button', { name: 'Record Round' }));

        await waitFor(() =>
            expect(axios.post).toHaveBeenCalledWith('/api/v1/games/5/rounds', {
                scores: [
                    { team_id: 10, points: -100 },
                    { team_id: 11, points: -100 },
                ],
            }),
        );
    });

    it('uses element points (not penalty) in the submitted score when a boolean element with penalty is checked', async () => {
        const penalizedBurako = { id: 1, name: 'burako', label: 'Burako', points: 100, penalty: 100, input_type: 'boolean' };
        axios.get.mockResolvedValue({ data: { data: { base_elements: [penalizedBurako] } } });
        axios.post.mockResolvedValueOnce(makeGameResponse([teamA, teamB], []));

        render(<RoundsCard initialTeams={[teamA, teamB]} initialRounds={[]} selectedGame={selectedGame} />);

        const burakoCheckboxes = await screen.findAllByLabelText('Burako');
        // Check Burako for Team Alpha only
        await userEvent.click(burakoCheckboxes[0]);

        await userEvent.click(screen.getByRole('button', { name: 'Record Round' }));

        await waitFor(() =>
            expect(axios.post).toHaveBeenCalledWith('/api/v1/games/5/rounds', {
                scores: [
                    { team_id: 10, points: 100 },  // checked → normal 100 pts
                    { team_id: 11, points: -100 },  // unchecked → -100 penalty
                ],
            }),
        );
    });

    describe('round draft persistence', () => {
        it('pre-fills inputs from a saved draft when the game loads', async () => {
            const draftResponse = {
                data: {
                    data: {
                        round_draft: {
                            base_inputs: {
                                10: { 1: true, 2: 3 },
                                11: { 1: false, 2: 1 },
                            },
                            card_inputs: {
                                10: { cardsInHand: 5, cardsOnTable: 0 },
                                11: { cardsInHand: 0, cardsOnTable: 2 },
                            },
                        },
                    },
                },
            };

            axios.get.mockImplementation((url) =>
                url.includes('round-draft')
                    ? Promise.resolve(draftResponse)
                    : Promise.resolve(elementsResponse),
            );

            render(<RoundsCard initialTeams={[teamA, teamB]} initialRounds={[]} selectedGame={selectedGame} />);

            // Draft checkbox for Team Alpha should be pre-checked
            const burakoCheckboxes = await screen.findAllByLabelText('Burako');
            await waitFor(() => expect(burakoCheckboxes[0]).toBeChecked());

            // Draft quantity for Team Alpha should be 3
            const canInputs = screen.getAllByLabelText('Clean Canastra');
            await waitFor(() => expect(canInputs[0]).toHaveValue(3));

            // Draft card inputs should be applied
            const inHandInputs = screen.getAllByLabelText('Points in Hand');
            await waitFor(() => expect(inHandInputs[0]).toHaveValue(5));
        });

        it('sends a PUT request to persist the draft when inputs change', async () => {
            axios.get.mockImplementation((url) =>
                url.includes('round-draft')
                    ? Promise.resolve({ data: { data: { round_draft: null } } })
                    : Promise.resolve(elementsResponse),
            );
            axios.put = vi.fn().mockResolvedValue({});

            render(<RoundsCard initialTeams={[teamA, teamB]} initialRounds={[]} selectedGame={selectedGame} />);

            const burakoCheckboxes = await screen.findAllByLabelText('Burako');
            await userEvent.click(burakoCheckboxes[0]);

            await waitFor(
                () =>
                    expect(axios.put).toHaveBeenCalledWith(
                        '/api/v1/games/5/round-draft',
                        expect.objectContaining({ base_inputs: expect.any(Object) }),
                    ),
                { timeout: 2000 },
            );
        });

        it('does not save a draft immediately after a successful round submission', async () => {
            axios.get.mockImplementation((url) =>
                url.includes('round-draft')
                    ? Promise.resolve({ data: { data: { round_draft: null } } })
                    : Promise.resolve(elementsResponse),
            );
            axios.post.mockResolvedValueOnce(makeGameResponse([teamA, teamB], [round1]));
            axios.put = vi.fn().mockResolvedValue({});

            render(<RoundsCard initialTeams={[teamA, teamB]} initialRounds={[]} selectedGame={selectedGame} />);

            await screen.findAllByLabelText('Burako');
            await userEvent.click(screen.getByRole('button', { name: 'Record Round' }));

            // Wait for the round to be recorded
            await waitFor(() => expect(axios.post).toHaveBeenCalled());

            // Reset vi.fn call count after the round post
            axios.put.mockClear();

            // No draft PUT should fire right after submission (inputs were just reset to defaults)
            // Use a short wait that is less than the 800ms debounce
            await new Promise((r) => setTimeout(r, 100));
            expect(axios.put).not.toHaveBeenCalled();
        });
    });

    describe('round history expand/collapse', () => {
        const round2 = {
            round_number: 2,
            scores: [
                { team_id: 10, team_name: 'Team Alpha', points: 200 },
                { team_id: 11, team_name: 'Team Beta', points: 150 },
            ],
        };

        const nullDraftResponse = { data: { data: { round_draft: null } } };
        const roundDraftResponse = {
            data: {
                data: {
                    round_draft: {
                        base_inputs: {
                            10: { 1: true, 2: 0 },
                            11: { 1: false, 2: 2 },
                        },
                        card_inputs: {
                            10: { cardsInHand: 5, cardsOnTable: 0 },
                            11: { cardsInHand: 0, cardsOnTable: 10 },
                        },
                    },
                },
            },
        };

        beforeEach(() => {
            // Provide a no-op PUT so the debounced draft save doesn't throw.
            axios.put = vi.fn().mockResolvedValue({});
            // Mock all GET calls: active draft and per-round draft return null; elements return fixture.
            axios.get.mockImplementation((url) => {
                if (url.includes('/round-draft') || url.match(/\/rounds\/\d+\/draft/)) {
                    return Promise.resolve(nullDraftResponse);
                }
                return Promise.resolve(elementsResponse);
            });
        });

        it('renders an expand button for each round in the history', async () => {
            render(
                <RoundsCard
                    initialRounds={[round1, round2]}
                    initialTeams={[teamA, teamB]}
                    selectedGame={selectedGame}
                />,
            );

            await screen.findAllByLabelText('Burako');

            const expandButtons = screen.getAllByRole('button', { name: /expand round/i });
            expect(expandButtons).toHaveLength(2);
        });

        it('clicking the expand button shows the round scoring detail panel', async () => {
            render(
                <RoundsCard
                    initialRounds={[round1]}
                    initialTeams={[teamA, teamB]}
                    selectedGame={selectedGame}
                />,
            );

            await screen.findAllByLabelText('Burako');

            const expandButton = screen.getByRole('button', { name: /expand round 1 detail/i });
            await userEvent.click(expandButton);

            expect(screen.getByText(/round 1.*scoring detail/i)).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /collapse round 1 detail/i })).toBeInTheDocument();
        });

        it('clicking the button again collapses the detail panel', async () => {
            render(
                <RoundsCard
                    initialRounds={[round1]}
                    initialTeams={[teamA, teamB]}
                    selectedGame={selectedGame}
                />,
            );

            await screen.findAllByLabelText('Burako');

            const expandButton = screen.getByRole('button', { name: /expand round 1 detail/i });
            await userEvent.click(expandButton);

            expect(screen.getByText(/round 1.*scoring detail/i)).toBeInTheDocument();

            const collapseButton = screen.getByRole('button', { name: /collapse round 1 detail/i });
            await userEvent.click(collapseButton);

            expect(screen.queryByText(/scoring detail/i)).not.toBeInTheDocument();
        });

        it('expanding a second round collapses the first (accordion)', async () => {
            render(
                <RoundsCard
                    initialRounds={[round1, round2]}
                    initialTeams={[teamA, teamB]}
                    selectedGame={selectedGame}
                />,
            );

            await screen.findAllByLabelText('Burako');

            // Expand round 1
            await userEvent.click(screen.getByRole('button', { name: /expand round 1 detail/i }));
            expect(screen.getByText(/round 1.*scoring detail/i)).toBeInTheDocument();

            // Expand round 2 → round 1 detail should disappear
            await userEvent.click(screen.getByRole('button', { name: /expand round 2 detail/i }));
            expect(screen.queryByText(/round 1.*scoring detail/i)).not.toBeInTheDocument();
            expect(screen.getByText(/round 2.*scoring detail/i)).toBeInTheDocument();
        });

        it('shows each team name inside the detail panel when the draft is null', async () => {
            render(
                <RoundsCard
                    initialRounds={[round1]}
                    initialTeams={[teamA, teamB]}
                    selectedGame={selectedGame}
                />,
            );

            await screen.findAllByLabelText('Burako');

            await userEvent.click(screen.getByRole('button', { name: /expand round 1 detail/i }));

            // Wait for the draft fetch to resolve (null) and the loading state to clear.
            await waitFor(() =>
                expect(screen.queryByText(/loading detail/i)).not.toBeInTheDocument(),
            );

            // Both team names should appear in the detail panel.
            expect(screen.getAllByText('Team Alpha').length).toBeGreaterThanOrEqual(1);
            expect(screen.getAllByText('Team Beta').length).toBeGreaterThanOrEqual(1);

            // No draft captured message should be present for both teams.
            expect(screen.getAllByText(/no scoring detail captured/i)).toHaveLength(2);
        });

        it('shows read-only draft inputs when a draft is available for the round', async () => {
            axios.get.mockImplementation((url) => {
                if (url.match(/\/rounds\/\d+\/draft/)) return Promise.resolve(roundDraftResponse);
                if (url.includes('/round-draft')) return Promise.resolve(nullDraftResponse);
                return Promise.resolve(elementsResponse);
            });

            render(
                <RoundsCard
                    initialRounds={[round1]}
                    initialTeams={[teamA, teamB]}
                    selectedGame={selectedGame}
                />,
            );

            await screen.findAllByLabelText('Burako');

            await userEvent.click(screen.getByRole('button', { name: /expand round 1 detail/i }));

            // Wait for the draft to load and render the read-only inputs.
            await waitFor(() =>
                expect(screen.queryByText(/loading detail/i)).not.toBeInTheDocument(),
            );

            // Read-only inputs should be present (Points in Hand appears twice — one per team in the detail panel).
            const pointsInHandInputs = screen.getAllByLabelText('Points in Hand');
            const disabledInputs = pointsInHandInputs.filter((input) => input.disabled);
            expect(disabledInputs.length).toBeGreaterThanOrEqual(2);
            // All those inputs should be disabled (read-only mode).
            disabledInputs.forEach((input) => expect(input).toBeDisabled());
        });

        it('clicking outside the toggle collapses the expanded detail', async () => {
            render(
                <RoundsCard
                    initialRounds={[round1]}
                    initialTeams={[teamA, teamB]}
                    selectedGame={selectedGame}
                />,
            );

            await screen.findAllByLabelText('Burako');

            await userEvent.click(screen.getByRole('button', { name: /expand round 1 detail/i }));
            expect(screen.getByText(/round 1.*scoring detail/i)).toBeInTheDocument();

            // Simulate a click anywhere else on the document
            fireEvent.click(document.body);

            expect(screen.queryByText(/scoring detail/i)).not.toBeInTheDocument();
        });

        it('recording a round collapses any expanded detail', async () => {
            axios.post.mockResolvedValueOnce(
                makeGameResponse([teamA, teamB], [round1]),
            );

            render(
                <RoundsCard
                    initialRounds={[round1]}
                    initialTeams={[teamA, teamB]}
                    selectedGame={selectedGame}
                />,
            );

            await screen.findAllByLabelText('Burako');

            // Expand round 1
            await userEvent.click(screen.getByRole('button', { name: /expand round 1 detail/i }));
            expect(screen.getByText(/round 1.*scoring detail/i)).toBeInTheDocument();

            // Submit a new round
            await userEvent.click(screen.getByRole('button', { name: 'Record Round' }));

            await waitFor(() =>
                expect(screen.queryByText(/scoring detail/i)).not.toBeInTheDocument(),
            );
        });
    });

    describe('player count mismatch', () => {
        it('hides the scoring form and shows a mismatch message when teams have different player counts', async () => {
            const teamWithPlayer = {
                ...teamA,
                players: [{ id: 1, display_name: 'Alice' }],
            };
            const teamWithoutPlayer = { ...teamB, players: [] };

            render(
                <RoundsCard
                    initialRounds={[]}
                    initialTeams={[teamWithPlayer, teamWithoutPlayer]}
                    selectedGame={selectedGame}
                />,
            );

            await screen.findByText(
                'Both teams must have the same number of players to record rounds.',
            );
            expect(screen.queryByRole('button', { name: 'Record Round' })).not.toBeInTheDocument();
        });

        it('shows the scoring form once both teams have equal player counts', async () => {
            axios.get.mockImplementation((url) =>
                url.includes('round-draft')
                    ? Promise.resolve({ data: { data: { round_draft: null } } })
                    : Promise.resolve(elementsResponse),
            );

            const teamWithPlayer = {
                ...teamA,
                players: [{ id: 1, display_name: 'Alice' }],
            };
            const teamWithoutPlayer = { ...teamB, players: [] };

            const { rerender } = render(
                <RoundsCard
                    initialRounds={[]}
                    initialTeams={[teamWithPlayer, teamWithoutPlayer]}
                    selectedGame={selectedGame}
                />,
            );

            await screen.findByText(
                'Both teams must have the same number of players to record rounds.',
            );

            const teamBWithPlayer = {
                ...teamB,
                players: [{ id: 2, display_name: 'Bob' }],
            };

            rerender(
                <RoundsCard
                    initialRounds={[]}
                    initialTeams={[teamWithPlayer, teamBWithPlayer]}
                    selectedGame={selectedGame}
                />,
            );

            await screen.findByText('Round 1');
            expect(
                screen.queryByText(
                    'Both teams must have the same number of players to record rounds.',
                ),
            ).not.toBeInTheDocument();
        });
    });

    describe('hasTwoTeams prop', () => {
        it('shows the scoring form when hasTwoTeams is true even with no local teams', async () => {
            axios.get.mockImplementation((url) =>
                url.includes('round-draft')
                    ? Promise.resolve({ data: { data: { round_draft: null } } })
                    : Promise.resolve(elementsResponse),
            );

            render(
                <RoundsCard
                    hasTwoTeams={true}
                    initialRounds={[]}
                    initialTeams={[]}
                    selectedGame={selectedGame}
                />,
            );

            await screen.findByText('Round 1');
            expect(
                screen.queryByText('Add both teams before recording rounds.'),
            ).not.toBeInTheDocument();
        });

        it('still shows the "Add both teams" message when hasTwoTeams is false and no teams are present', async () => {
            render(
                <RoundsCard
                    hasTwoTeams={false}
                    initialRounds={[]}
                    initialTeams={[]}
                    selectedGame={selectedGame}
                />,
            );

            await screen.findByText('Add both teams before recording rounds.');
        });

        it('shows the scoring form when hasTwoTeams becomes true after team assignment', async () => {
            axios.get.mockImplementation((url) =>
                url.includes('round-draft')
                    ? Promise.resolve({ data: { data: { round_draft: null } } })
                    : Promise.resolve(elementsResponse),
            );

            const { rerender } = render(
                <RoundsCard
                    hasTwoTeams={false}
                    initialRounds={[]}
                    initialTeams={[]}
                    selectedGame={selectedGame}
                />,
            );

            expect(
                screen.getByText('Add both teams before recording rounds.'),
            ).toBeInTheDocument();

            rerender(
                <RoundsCard
                    hasTwoTeams={true}
                    initialRounds={[]}
                    initialTeams={[teamA, teamB]}
                    selectedGame={selectedGame}
                />,
            );

            await screen.findByText('Round 1');
            expect(
                screen.queryByText('Add both teams before recording rounds.'),
            ).not.toBeInTheDocument();
        });
    });

    describe('team card collapse control (mobile)', () => {
        const mockDraftAndElements = (url) =>
            url.includes('round-draft')
                ? Promise.resolve({ data: { data: { round_draft: null } } })
                : Promise.resolve(elementsResponse);

        it('renders a collapse button for each team card', async () => {
            axios.get.mockImplementation(mockDraftAndElements);

            render(
                <RoundsCard
                    initialRounds={[]}
                    initialTeams={[teamA, teamB]}
                    selectedGame={selectedGame}
                />,
            );

            await screen.findAllByLabelText('Burako');

            expect(
                screen.getByRole('button', { name: 'Collapse Team Alpha score inputs' }),
            ).toBeInTheDocument();
            expect(
                screen.getByRole('button', { name: 'Collapse Team Beta score inputs' }),
            ).toBeInTheDocument();
        });

        it('clicking the collapse button hides that team\'s score inputs', async () => {
            axios.get.mockImplementation(mockDraftAndElements);

            render(
                <RoundsCard
                    initialRounds={[]}
                    initialTeams={[teamA, teamB]}
                    selectedGame={selectedGame}
                />,
            );

            const burakoCheckboxes = await screen.findAllByLabelText('Burako');
            expect(burakoCheckboxes).toHaveLength(2);

            await userEvent.click(
                screen.getByRole('button', { name: 'Collapse Team Alpha score inputs' }),
            );

            // Team Alpha's inputs should be hidden; Team Beta's should remain visible
            const remaining = screen.getAllByLabelText('Burako');
            expect(remaining).toHaveLength(1);
        });

        it('clicking the button again expands the team\'s score inputs', async () => {
            axios.get.mockImplementation(mockDraftAndElements);

            render(
                <RoundsCard
                    initialRounds={[]}
                    initialTeams={[teamA, teamB]}
                    selectedGame={selectedGame}
                />,
            );

            await screen.findAllByLabelText('Burako');

            const collapseBtn = screen.getByRole('button', { name: 'Collapse Team Alpha score inputs' });
            await userEvent.click(collapseBtn);

            // Now collapsed — button label should flip to "Expand"
            const expandBtn = screen.getByRole('button', { name: 'Expand Team Alpha score inputs' });
            expect(expandBtn).toBeInTheDocument();

            await userEvent.click(expandBtn);

            // Inputs should be visible again
            const burakoCheckboxes = screen.getAllByLabelText('Burako');
            expect(burakoCheckboxes).toHaveLength(2);
        });

        it('collapsing one team does not hide the other team\'s inputs', async () => {
            axios.get.mockImplementation(mockDraftAndElements);

            render(
                <RoundsCard
                    initialRounds={[]}
                    initialTeams={[teamA, teamB]}
                    selectedGame={selectedGame}
                />,
            );

            await screen.findAllByLabelText('Burako');

            await userEvent.click(
                screen.getByRole('button', { name: 'Collapse Team Alpha score inputs' }),
            );

            // Team Beta's inputs must still be accessible
            expect(screen.getByRole('button', { name: 'Collapse Team Beta score inputs' })).toBeInTheDocument();
            const canInputs = screen.getAllByLabelText('Clean Canastra');
            expect(canInputs).toHaveLength(1);
        });

        it('collapse button has aria-expanded=false when collapsed and true when expanded', async () => {
            axios.get.mockImplementation(mockDraftAndElements);

            render(
                <RoundsCard
                    initialRounds={[]}
                    initialTeams={[teamA, teamB]}
                    selectedGame={selectedGame}
                />,
            );

            await screen.findAllByLabelText('Burako');

            const collapseBtn = screen.getByRole('button', { name: 'Collapse Team Alpha score inputs' });
            expect(collapseBtn).toHaveAttribute('aria-expanded', 'true');

            await userEvent.click(collapseBtn);

            const expandBtn = screen.getByRole('button', { name: 'Expand Team Alpha score inputs' });
            expect(expandBtn).toHaveAttribute('aria-expanded', 'false');
        });
    });

    describe('viewport layout transition (stacked ↔ non-stacked)', () => {
        const mockDraftAndElements = (url) =>
            url.includes('round-draft')
                ? Promise.resolve({ data: { data: { round_draft: null } } })
                : Promise.resolve(elementsResponse);

        let mqListeners;
        let mockMq;

        const setupMatchMedia = (initialMatches) => {
            mqListeners = [];
            mockMq = {
                matches: initialMatches,
                addEventListener: (_event, listener) => mqListeners.push(listener),
                removeEventListener: (_event, listener) => {
                    mqListeners = mqListeners.filter((l) => l !== listener);
                },
            };
            Object.defineProperty(window, 'matchMedia', {
                writable: true,
                configurable: true,
                value: () => mockMq,
            });
        };

        const triggerBreakpoint = (matches) => {
            mockMq.matches = matches;
            mqListeners.forEach((l) => l({ matches }));
        };

        afterEach(() => {
            Object.defineProperty(window, 'matchMedia', {
                writable: true,
                configurable: true,
                value: undefined,
            });
        });

        it('when starting at non-stacked width, both team cards are expanded', async () => {
            setupMatchMedia(true);
            axios.get.mockImplementation(mockDraftAndElements);

            render(
                <RoundsCard
                    initialRounds={[]}
                    initialTeams={[teamA, teamB]}
                    selectedGame={selectedGame}
                />,
            );

            const burakoCheckboxes = await screen.findAllByLabelText('Burako');
            expect(burakoCheckboxes).toHaveLength(2);
        });

        it('transitioning to non-stacked expands both team cards regardless of prior collapse state', async () => {
            setupMatchMedia(false);
            axios.get.mockImplementation(mockDraftAndElements);

            render(
                <RoundsCard
                    initialRounds={[]}
                    initialTeams={[teamA, teamB]}
                    selectedGame={selectedGame}
                />,
            );

            await screen.findAllByLabelText('Burako');

            // Collapse Team Alpha while in stacked layout
            await userEvent.click(screen.getByRole('button', { name: 'Collapse Team Alpha score inputs' }));
            expect(screen.getAllByLabelText('Burako')).toHaveLength(1);

            // Transition to non-stacked (sm+): both cards should expand
            act(() => triggerBreakpoint(true));
            await waitFor(() => expect(screen.getAllByLabelText('Burako')).toHaveLength(2));
        });

        it('transitioning back to stacked restores the previous collapse state', async () => {
            setupMatchMedia(false);
            axios.get.mockImplementation(mockDraftAndElements);

            render(
                <RoundsCard
                    initialRounds={[]}
                    initialTeams={[teamA, teamB]}
                    selectedGame={selectedGame}
                />,
            );

            await screen.findAllByLabelText('Burako');

            // Collapse Team Alpha while stacked
            await userEvent.click(screen.getByRole('button', { name: 'Collapse Team Alpha score inputs' }));
            expect(screen.getAllByLabelText('Burako')).toHaveLength(1);

            // Go non-stacked: both expand
            act(() => triggerBreakpoint(true));
            await waitFor(() => expect(screen.getAllByLabelText('Burako')).toHaveLength(2));

            // Return to stacked: Team Alpha should be collapsed again
            act(() => triggerBreakpoint(false));
            await waitFor(() => expect(screen.getAllByLabelText('Burako')).toHaveLength(1));
        });

        it('transitioning back to stacked keeps all cards expanded when none were collapsed before', async () => {
            setupMatchMedia(false);
            axios.get.mockImplementation(mockDraftAndElements);

            render(
                <RoundsCard
                    initialRounds={[]}
                    initialTeams={[teamA, teamB]}
                    selectedGame={selectedGame}
                />,
            );

            await screen.findAllByLabelText('Burako');

            // Go non-stacked without collapsing anything, then return to stacked
            act(() => triggerBreakpoint(true));
            act(() => triggerBreakpoint(false));

            // Both should still be expanded
            await waitFor(() => expect(screen.getAllByLabelText('Burako')).toHaveLength(2));
        });
    });

    describe('live running-total score next to team name', () => {
        const mockDraftAndElements = (url) =>
            url.includes('round-draft')
                ? Promise.resolve({ data: { data: { round_draft: null } } })
                : Promise.resolve(elementsResponse);

        it('shows 0 for each team when there are no previous rounds and no inputs entered', async () => {
            axios.get.mockImplementation(mockDraftAndElements);

            render(
                <RoundsCard
                    initialRounds={[]}
                    initialTeams={[teamA, teamB]}
                    selectedGame={selectedGame}
                />,
            );

            await screen.findByText('Team Alpha');
            // Both accrued+ongoing totals should be 0
            const zeros = screen.getAllByTitle('Accrued score + this round');
            expect(zeros).toHaveLength(2);
            zeros.forEach((el) => expect(el).toHaveTextContent('0'));
        });

        it('reflects past-round accrued scores when rounds are provided', async () => {
            axios.get.mockImplementation(mockDraftAndElements);

            render(
                <RoundsCard
                    initialRounds={[round1]}
                    initialTeams={[teamA, teamB]}
                    selectedGame={selectedGame}
                />,
            );

            // Wait for the two running-total spans to appear (they appear as soon as showScoringForm is true)
            const totals = await screen.findAllByTitle('Accrued score + this round');
            // round1: Team Alpha = 100, Team Beta = 400; no current inputs so ongoing = 0
            expect(totals[0]).toHaveTextContent('100');
            expect(totals[1]).toHaveTextContent('400');
        });

        it('updates the running total live as the user types into a quantity input', async () => {
            axios.get.mockImplementation(mockDraftAndElements);
            const user = userEvent.setup();

            render(
                <RoundsCard
                    initialRounds={[round1]}
                    initialTeams={[teamA, teamB]}
                    selectedGame={selectedGame}
                />,
            );

            // Wait for elements to load (Clean Canastra inputs appear)
            const canInputs = await screen.findAllByLabelText('Clean Canastra');

            // Type 1 into Team Alpha's Clean Canastra quantity input
            await user.clear(canInputs[0]);
            await user.type(canInputs[0], '1');

            // Team Alpha accrued 100 from round1 + 200 points for 1 clean canastra = 300
            const totals = screen.getAllByTitle('Accrued score + this round');
            expect(totals[0]).toHaveTextContent('300');
            // Team Beta unchanged: 400
            expect(totals[1]).toHaveTextContent('400');
        });
    });
});

