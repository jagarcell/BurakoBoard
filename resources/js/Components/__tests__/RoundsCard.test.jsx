import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import api from '@/api/client';
import RoundsCard from '@/Components/RoundsCard';

vi.mock('@/api/client', () => ({
    default: {
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
    },
}));

const mockPlayWinnerSound = vi.fn();
const mockUnlockWinnerSound = vi.fn();
vi.mock('@/hooks/useWinnerSound', () => ({
    default: () => ({ unlock: mockUnlockWinnerSound, play: mockPlayWinnerSound }),
}));

vi.mock('@/hooks/useVoiceAliases', () => ({
    default: () => ({
        aliases: [],
        isLoading: false,
        error: null,
        addAlias: vi.fn(),
        removeAlias: vi.fn(),
    }),
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
        api.get.mockResolvedValue(elementsResponse);
    });

    it('shows a placeholder when no game is selected', async () => {
        render(<RoundsCard selectedGame={null} />);

        // findByText wraps the lookup in waitFor/act, which drains the
        // pending axios.get microtask and resulting setElements state update
        // so no out-of-act warning is emitted.
        expect(await screen.findByText('Select a game above to record rounds.')).toBeInTheDocument();
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
        api.post.mockResolvedValueOnce(
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
            expect(api.post).toHaveBeenCalledWith('/games/5/rounds', {
                scores: [
                    { team_id: 10, points: 100 },
                    { team_id: 11, points: 400 },
                ],
            }),
        );

        await screen.findAllByText('100');
    });

    it('resets base element inputs to defaults after a successful round submission', async () => {
        api.post.mockResolvedValueOnce(makeGameResponse([teamA, teamB], [round1]));

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
        api.post.mockResolvedValueOnce(
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
            expect(onRoundRecorded).toHaveBeenCalledWith(
                [updatedTeamA, updatedTeamB],
                'in_progress',
                expect.objectContaining({
                    teams: [updatedTeamA, updatedTeamB],
                    rounds: [round1],
                }),
            ),
        );
    });

    it('calls onRoundRecorded callback with updated teams and finished status when the round ends the game', async () => {
        const updatedTeamA = { ...teamA, current_score: 2100 };
        const updatedTeamB = { ...teamB, current_score: 800 };
        api.post.mockResolvedValueOnce(
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
            expect(onRoundRecorded).toHaveBeenCalledWith(
                [updatedTeamA, updatedTeamB],
                'finished',
                expect.objectContaining({
                    teams: [updatedTeamA, updatedTeamB],
                    rounds: [round1],
                }),
            ),
        );
    });

    it('plays the winner sound when the recorded round ends the game', async () => {
        const updatedTeamA = { ...teamA, current_score: 2100 };
        const updatedTeamB = { ...teamB, current_score: 800 };
        api.post.mockResolvedValueOnce(
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
        api.post.mockResolvedValueOnce(
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

        await waitFor(() => expect(api.post).toHaveBeenCalled());
        expect(mockPlayWinnerSound).not.toHaveBeenCalled();
    });

    it('calls unlockWinnerSound synchronously when the Record Round button is clicked', async () => {
        api.post.mockResolvedValueOnce(makeGameResponse([teamA, teamB], [round1]));

        render(
            <RoundsCard
                initialTeams={[teamA, teamB]}
                initialRounds={[]}
                selectedGame={selectedGame}
            />,
        );

        await screen.findAllByLabelText('Burako');
        await userEvent.click(screen.getByRole('button', { name: 'Record Round' }));

        await waitFor(() => expect(api.post).toHaveBeenCalled());
        expect(mockUnlockWinnerSound).toHaveBeenCalledTimes(1);
    });

    it('shows a save error and does not call onRoundRecorded when the API call fails', async () => {
        api.post.mockRejectedValueOnce(new Error('Network error'));

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
        expect(api.post).not.toHaveBeenCalled();
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
        api.post.mockResolvedValueOnce(
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
            expect(api.post).toHaveBeenCalledWith('/games/5/rounds', {
                scores: [
                    { team_id: 10, points: 60 },
                    { team_id: 11, points: 450 },
                ],
            }),
        );
    });

    it('resets card inputs to zero after a successful round submission', async () => {
        api.post.mockResolvedValueOnce(makeGameResponse([teamA, teamB], [round1]));

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
        expect(api.post).not.toHaveBeenCalled();
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
        expect(api.post).not.toHaveBeenCalled();
    });

    it('subtracts both pointsInHand and pointsOnTable from base points when a score_override element is checked', async () => {
        const overrideEl = { id: 3, name: 'penalty_element', label: 'Penalty Element', points: 0, input_type: 'boolean', score_override: true };
        const extendedElements = [...baseElements, overrideEl];
        api.get.mockResolvedValue({ data: { data: { base_elements: extendedElements } } });
        api.post.mockResolvedValueOnce(makeGameResponse([teamA, teamB], [round1]));

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
            expect(api.post).toHaveBeenCalledWith('/games/5/rounds', {
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
        api.post.mockResolvedValueOnce(
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
            expect(api.post).toHaveBeenCalledWith('/games/5/rounds', {
                scores: [
                    { team_id: 10, points: 70 },
                    { team_id: 11, points: 450 },
                ],
            }),
        );
    });

    it('unchecks a mutually-exclusive boolean for other teams when checked for one team', async () => {
        const mutualEl = { id: 3, name: 'clean_cut', label: 'Clean Cut', points: 100, input_type: 'boolean', mutually_exclusive: true };
        api.get.mockResolvedValue({ data: { data: { base_elements: [...baseElements, mutualEl] } } });

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
        api.get.mockResolvedValue({ data: { data: { base_elements: [penalizedBurako] } } });
        api.post.mockResolvedValueOnce(makeGameResponse([teamA, teamB], []));

        render(<RoundsCard initialTeams={[teamA, teamB]} initialRounds={[]} selectedGame={selectedGame} />);

        // Leave Burako unchecked for both teams — penalty of -100 applies to each
        await screen.findAllByLabelText('Burako');
        await userEvent.click(screen.getByRole('button', { name: 'Record Round' }));

        await waitFor(() =>
            expect(api.post).toHaveBeenCalledWith('/games/5/rounds', {
                scores: [
                    { team_id: 10, points: -100 },
                    { team_id: 11, points: -100 },
                ],
            }),
        );
    });

    it('uses element points (not penalty) in the submitted score when a boolean element with penalty is checked', async () => {
        const penalizedBurako = { id: 1, name: 'burako', label: 'Burako', points: 100, penalty: 100, input_type: 'boolean' };
        api.get.mockResolvedValue({ data: { data: { base_elements: [penalizedBurako] } } });
        api.post.mockResolvedValueOnce(makeGameResponse([teamA, teamB], []));

        render(<RoundsCard initialTeams={[teamA, teamB]} initialRounds={[]} selectedGame={selectedGame} />);

        const burakoCheckboxes = await screen.findAllByLabelText('Burako');
        // Check Burako for Team Alpha only
        await userEvent.click(burakoCheckboxes[0]);

        await userEvent.click(screen.getByRole('button', { name: 'Record Round' }));

        await waitFor(() =>
            expect(api.post).toHaveBeenCalledWith('/games/5/rounds', {
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

            api.get.mockImplementation((url) =>
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
            api.get.mockImplementation((url) =>
                url.includes('round-draft')
                    ? Promise.resolve({ data: { data: { round_draft: null } } })
                    : Promise.resolve(elementsResponse),
            );
            api.put = vi.fn().mockResolvedValue({});

            render(<RoundsCard initialTeams={[teamA, teamB]} initialRounds={[]} selectedGame={selectedGame} />);

            const burakoCheckboxes = await screen.findAllByLabelText('Burako');
            await userEvent.click(burakoCheckboxes[0]);

            await waitFor(
                () =>
                    expect(api.put).toHaveBeenCalledWith(
                        '/games/5/round-draft',
                        expect.objectContaining({ base_inputs: expect.any(Object) }),
                    ),
                { timeout: 2000 },
            );
        });

        it('does not save a draft immediately after a successful round submission', async () => {
            api.get.mockImplementation((url) =>
                url.includes('round-draft')
                    ? Promise.resolve({ data: { data: { round_draft: null } } })
                    : Promise.resolve(elementsResponse),
            );
            api.post.mockResolvedValueOnce(makeGameResponse([teamA, teamB], [round1]));
            api.put = vi.fn().mockResolvedValue({});

            render(<RoundsCard initialTeams={[teamA, teamB]} initialRounds={[]} selectedGame={selectedGame} />);

            await screen.findAllByLabelText('Burako');
            await userEvent.click(screen.getByRole('button', { name: 'Record Round' }));

            // Wait for the round to be recorded
            await waitFor(() => expect(api.post).toHaveBeenCalled());

            // Reset vi.fn call count after the round post
            api.put.mockClear();

            // No draft PUT should fire right after submission (inputs were just reset to defaults)
            // Use a short wait that is less than the 800ms debounce
            await new Promise((r) => setTimeout(r, 100));
            expect(api.put).not.toHaveBeenCalled();
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
            api.put = vi.fn().mockResolvedValue({});
            // Mock all GET calls: active draft and per-round draft return null; elements return fixture.
            api.get.mockImplementation((url) => {
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
            api.get.mockImplementation((url) => {
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
            api.post.mockResolvedValueOnce(
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
            api.get.mockImplementation((url) =>
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
            api.get.mockImplementation((url) =>
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
            api.get.mockImplementation((url) =>
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

    describe('hasCutter prop', () => {
        it('shows the cutter-required message when teams are set but no cutter is designated', async () => {
            render(
                <RoundsCard
                    hasCutter={false}
                    hasTwoTeams={true}
                    initialRounds={[]}
                    initialTeams={[teamA, teamB]}
                    selectedGame={selectedGame}
                />,
            );

            await screen.findByText(
                'Waiting for round 1 cutter to be set in the Player Order section ...',
            );
            expect(
                screen.queryByText('Add both teams before recording rounds.'),
            ).not.toBeInTheDocument();
        });

        it('shows the scoring form once hasCutter becomes true', async () => {
            api.get.mockImplementation((url) =>
                url.includes('round-draft')
                    ? Promise.resolve({ data: { data: { round_draft: null } } })
                    : Promise.resolve(elementsResponse),
            );

            const { rerender } = render(
                <RoundsCard
                    hasCutter={false}
                    hasTwoTeams={true}
                    initialRounds={[]}
                    initialTeams={[teamA, teamB]}
                    selectedGame={selectedGame}
                />,
            );

            expect(
                screen.getByText(
                    'Waiting for round 1 cutter to be set in the Player Order section ...',
                ),
            ).toBeInTheDocument();

            rerender(
                <RoundsCard
                    hasCutter={true}
                    hasTwoTeams={true}
                    initialRounds={[]}
                    initialTeams={[teamA, teamB]}
                    selectedGame={selectedGame}
                />,
            );

            await screen.findByText('Round 1');
            expect(
                screen.queryByText(
                    'Waiting for round 1 cutter to be set in the Player Order section ...',
                ),
            ).not.toBeInTheDocument();
        });
    });

    describe('team card collapse control (mobile)', () => {
        const mockDraftAndElements = (url) =>
            url.includes('round-draft')
                ? Promise.resolve({ data: { data: { round_draft: null } } })
                : Promise.resolve(elementsResponse);

        it('renders a collapse button for each team card', async () => {
            api.get.mockImplementation(mockDraftAndElements);

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
            api.get.mockImplementation(mockDraftAndElements);

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
            api.get.mockImplementation(mockDraftAndElements);

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
            api.get.mockImplementation(mockDraftAndElements);

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
            api.get.mockImplementation(mockDraftAndElements);

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

        it('collapsing a team scrolls the other team into view', async () => {
            api.get.mockImplementation(mockDraftAndElements);

            const scrollIntoViewMock = vi.fn();
            window.HTMLElement.prototype.scrollIntoView = scrollIntoViewMock;

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

            // scrollIntoView should have been called on the other team (Team Beta)
            await waitFor(() => {
                expect(scrollIntoViewMock).toHaveBeenCalledWith({ behavior: 'smooth', block: 'nearest' });
            });

            delete window.HTMLElement.prototype.scrollIntoView;
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
            api.get.mockImplementation(mockDraftAndElements);

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
            api.get.mockImplementation(mockDraftAndElements);

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
            api.get.mockImplementation(mockDraftAndElements);

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
            api.get.mockImplementation(mockDraftAndElements);

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
            api.get.mockImplementation(mockDraftAndElements);

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
            api.get.mockImplementation(mockDraftAndElements);

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
            api.get.mockImplementation(mockDraftAndElements);
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

    describe('player circle toggle', () => {
        beforeEach(() => {
            api.put = vi.fn().mockResolvedValue({});
        });

        const teamAWithPlayers = {
            ...teamA,
            players: [
                { id: 1, user_id: null, display_name: 'Alice', seat_number: 1 },
                { id: 3, user_id: null, display_name: 'Carlos', seat_number: 3 },
            ],
        };
        const teamBWithPlayers = {
            ...teamB,
            players: [
                { id: 2, user_id: null, display_name: 'Bruno', seat_number: 2 },
                { id: 4, user_id: null, display_name: 'Diana', seat_number: 4 },
            ],
        };

        const roundWithRoles = {
            round_number: 1,
            scores: [
                { team_id: 10, team_name: 'Team Alpha', points: 100 },
                { team_id: 11, team_name: 'Team Beta', points: 400 },
            ],
        };

        const roundRoles = [
            {
                round_number: 1,
                cutter: { player_id: 1, display_name: 'Alice', seat_number: 1 },
                dealer: { player_id: 2, display_name: 'Bruno', seat_number: 2 },
                first_draw: { player_id: 3, display_name: 'Carlos', seat_number: 3 },
            },
        ];

        it('renders a circle toggle button for each round in history', async () => {
            render(
                <RoundsCard
                    hasTwoTeams
                    initialRounds={[roundWithRoles]}
                    initialTeams={[teamAWithPlayers, teamBWithPlayers]}
                    roundRoles={roundRoles}
                    selectedGame={selectedGame}
                />,
            );

            const circleBtn = await screen.findByRole('button', {
                name: 'Show seating circle for round 1',
            });
            expect(circleBtn).toBeInTheDocument();
        });

        it('circle panel is not rendered before the button is clicked', async () => {
            render(
                <RoundsCard
                    hasTwoTeams
                    initialRounds={[roundWithRoles]}
                    initialTeams={[teamAWithPlayers, teamBWithPlayers]}
                    roundRoles={roundRoles}
                    selectedGame={selectedGame}
                />,
            );

            // Ensure the history row rendered
            await screen.findByRole('button', { name: 'Show seating circle for round 1' });

            // Player display names from the circle should not be visible yet
            expect(screen.queryByText('Alice')).not.toBeInTheDocument();
        });

        it('shows player names after clicking the circle toggle button', async () => {
            const user = userEvent.setup();

            render(
                <RoundsCard
                    hasTwoTeams
                    initialRounds={[roundWithRoles]}
                    initialTeams={[teamAWithPlayers, teamBWithPlayers]}
                    roundRoles={roundRoles}
                    selectedGame={selectedGame}
                />,
            );

            await user.click(
                await screen.findByRole('button', { name: 'Show seating circle for round 1' }),
            );

            expect(screen.getByText('Alice')).toBeInTheDocument();
            expect(screen.getByText('Bruno')).toBeInTheDocument();
            expect(screen.getByText('Carlos')).toBeInTheDocument();
            expect(screen.getByText('Diana')).toBeInTheDocument();
        });

        it('shows role badges inside the circle panel', async () => {
            const user = userEvent.setup();

            render(
                <RoundsCard
                    hasTwoTeams
                    initialRounds={[roundWithRoles]}
                    initialTeams={[teamAWithPlayers, teamBWithPlayers]}
                    roundRoles={roundRoles}
                    selectedGame={selectedGame}
                />,
            );

            await user.click(
                await screen.findByRole('button', { name: 'Show seating circle for round 1' }),
            );

            expect(screen.getByText('Cutter')).toBeInTheDocument();
            expect(screen.getByText('Dealer')).toBeInTheDocument();
            expect(screen.getByText('First Draw')).toBeInTheDocument();
        });

        it('circle toggle button label switches to "Hide" when circle is open', async () => {
            const user = userEvent.setup();

            render(
                <RoundsCard
                    hasTwoTeams
                    initialRounds={[roundWithRoles]}
                    initialTeams={[teamAWithPlayers, teamBWithPlayers]}
                    roundRoles={roundRoles}
                    selectedGame={selectedGame}
                />,
            );

            await user.click(
                await screen.findByRole('button', { name: 'Show seating circle for round 1' }),
            );

            expect(
                screen.getByRole('button', { name: 'Hide seating circle for round 1' }),
            ).toBeInTheDocument();
        });

        it('circle panel renders without role badges when no roundRoles provided', async () => {
            const user = userEvent.setup();

            render(
                <RoundsCard
                    hasTwoTeams
                    initialRounds={[roundWithRoles]}
                    initialTeams={[teamAWithPlayers, teamBWithPlayers]}
                    selectedGame={selectedGame}
                />,
            );

            await user.click(
                await screen.findByRole('button', { name: 'Show seating circle for round 1' }),
            );

            // Players should appear
            expect(screen.getByText('Alice')).toBeInTheDocument();
            // But no role badges
            expect(screen.queryByText('Cutter')).not.toBeInTheDocument();
        });

        describe('current round (scoring form)', () => {
            const roundRolesWithNext = [
                ...roundRoles,
                {
                    round_number: 2,
                    cutter: { player_id: 2, display_name: 'Bruno', seat_number: 2 },
                    dealer: { player_id: 3, display_name: 'Carlos', seat_number: 3 },
                    first_draw: { player_id: 4, display_name: 'Diana', seat_number: 4 },
                },
            ];

            it('renders a circle toggle button for the current (next) round', async () => {
                render(
                    <RoundsCard
                        hasTwoTeams
                        initialRounds={[roundWithRoles]}
                        initialTeams={[teamAWithPlayers, teamBWithPlayers]}
                        roundRoles={roundRolesWithNext}
                        selectedGame={selectedGame}
                    />,
                );

                // Round 2 is the next (current) round
                const circleBtn = await screen.findByRole('button', {
                    name: 'Show seating circle for round 2',
                });
                expect(circleBtn).toBeInTheDocument();
            });

            it('circle panel is not visible before the current-round button is clicked', async () => {
                render(
                    <RoundsCard
                        hasTwoTeams
                        initialRounds={[roundWithRoles]}
                        initialTeams={[teamAWithPlayers, teamBWithPlayers]}
                        roundRoles={roundRolesWithNext}
                        selectedGame={selectedGame}
                    />,
                );

                await screen.findByRole('button', { name: 'Show seating circle for round 2' });
                // Bruno is in the next-round circle — should not be visible yet
                expect(screen.queryByText('Bruno')).not.toBeInTheDocument();
            });

            it('shows player names after clicking the current-round circle button', async () => {
                const user = userEvent.setup();

                render(
                    <RoundsCard
                        hasTwoTeams
                        initialRounds={[roundWithRoles]}
                        initialTeams={[teamAWithPlayers, teamBWithPlayers]}
                        roundRoles={roundRolesWithNext}
                        selectedGame={selectedGame}
                    />,
                );

                await user.click(
                    await screen.findByRole('button', { name: 'Show seating circle for round 2' }),
                );

                expect(screen.getByText('Alice')).toBeInTheDocument();
                expect(screen.getByText('Bruno')).toBeInTheDocument();
                expect(screen.getByText('Carlos')).toBeInTheDocument();
                expect(screen.getByText('Diana')).toBeInTheDocument();
            });

            it('shows role badges for the current round inside the role panel', async () => {
                const user = userEvent.setup();

                render(
                    <RoundsCard
                        hasTwoTeams
                        initialRounds={[roundWithRoles]}
                        initialTeams={[teamAWithPlayers, teamBWithPlayers]}
                        roundRoles={roundRolesWithNext}
                        selectedGame={selectedGame}
                    />,
                );

                await user.click(
                    await screen.findByRole('button', { name: 'Show seating circle for round 2' }),
                );

                expect(screen.getByText('Cutter')).toBeInTheDocument();
                expect(screen.getByText('Dealer')).toBeInTheDocument();
                expect(screen.getByText('First Draw')).toBeInTheDocument();
            });

            it('circle toggle button label switches to "Hide" when current-round circle is open', async () => {
                const user = userEvent.setup();

                render(
                    <RoundsCard
                        hasTwoTeams
                        initialRounds={[roundWithRoles]}
                        initialTeams={[teamAWithPlayers, teamBWithPlayers]}
                        roundRoles={roundRolesWithNext}
                        selectedGame={selectedGame}
                    />,
                );

                await user.click(
                    await screen.findByRole('button', { name: 'Show seating circle for round 2' }),
                );

                expect(
                    screen.getByRole('button', { name: 'Hide seating circle for round 2' }),
                ).toBeInTheDocument();
            });

            it('opening the current-round circle hides both teams score inputs', async () => {
                const user = userEvent.setup();

                render(
                    <RoundsCard
                        hasTwoTeams
                        initialRounds={[roundWithRoles]}
                        initialTeams={[teamAWithPlayers, teamBWithPlayers]}
                        roundRoles={roundRolesWithNext}
                        selectedGame={selectedGame}
                    />,
                );

                // Both teams' Burako checkboxes should be visible before opening the circle.
                const burakoCheckboxes = await screen.findAllByLabelText('Burako');
                expect(burakoCheckboxes).toHaveLength(2);

                await user.click(
                    await screen.findByRole('button', { name: 'Show seating circle for round 2' }),
                );

                // All team score inputs should be hidden once the circle is open.
                expect(screen.queryAllByLabelText('Burako')).toHaveLength(0);
            });

            it('closing the current-round circle restores score inputs for teams that were visible', async () => {
                const user = userEvent.setup();

                render(
                    <RoundsCard
                        hasTwoTeams
                        initialRounds={[roundWithRoles]}
                        initialTeams={[teamAWithPlayers, teamBWithPlayers]}
                        roundRoles={roundRolesWithNext}
                        selectedGame={selectedGame}
                    />,
                );

                await screen.findAllByLabelText('Burako');

                // Open the circle, then close it.
                await user.click(
                    await screen.findByRole('button', { name: 'Show seating circle for round 2' }),
                );
                await user.click(
                    screen.getByRole('button', { name: 'Hide seating circle for round 2' }),
                );

                // Both inputs should be visible again.
                await waitFor(() =>
                    expect(screen.getAllByLabelText('Burako')).toHaveLength(2),
                );
            });

            it('a team that was already collapsed before opening the circle remains collapsed after closing', async () => {
                api.get.mockImplementation((url) =>
                    url.includes('round-draft')
                        ? Promise.resolve({ data: { data: { round_draft: null } } })
                        : Promise.resolve(elementsResponse),
                );
                api.put = vi.fn().mockResolvedValue({});

                const user = userEvent.setup();

                render(
                    <RoundsCard
                        hasTwoTeams
                        initialRounds={[roundWithRoles]}
                        initialTeams={[teamAWithPlayers, teamBWithPlayers]}
                        roundRoles={roundRolesWithNext}
                        selectedGame={selectedGame}
                    />,
                );

                await screen.findAllByLabelText('Burako');

                // Collapse Team Alpha before opening the circle.
                await user.click(
                    screen.getByRole('button', { name: 'Collapse Team Alpha score inputs' }),
                );
                expect(screen.getAllByLabelText('Burako')).toHaveLength(1);

                // Open then close the circle.
                await user.click(
                    screen.getByRole('button', { name: 'Show seating circle for round 2' }),
                );
                await user.click(
                    screen.getByRole('button', { name: 'Hide seating circle for round 2' }),
                );

                // Team Alpha should still be collapsed; Team Beta should be visible.
                await waitFor(() =>
                    expect(screen.getAllByLabelText('Burako')).toHaveLength(1),
                );
            });

            it('closing circle via outside click also restores team score inputs', async () => {
                const user = userEvent.setup();

                render(
                    <RoundsCard
                        hasTwoTeams
                        initialRounds={[roundWithRoles]}
                        initialTeams={[teamAWithPlayers, teamBWithPlayers]}
                        roundRoles={roundRolesWithNext}
                        selectedGame={selectedGame}
                    />,
                );

                await screen.findAllByLabelText('Burako');

                await user.click(
                    await screen.findByRole('button', { name: 'Show seating circle for round 2' }),
                );
                expect(screen.queryAllByLabelText('Burako')).toHaveLength(0);

                // Simulate outside click to dismiss.
                fireEvent.click(document.body);

                await waitFor(() =>
                    expect(screen.getAllByLabelText('Burako')).toHaveLength(2),
                );
            });
        });
    });

    describe('voice alias manager toggle (+ button)', () => {
        const aliasesResponse = { data: { data: [] } };

        const mockDraftElementsAndAliases = (url) => {
            if (url.includes('round-draft') || url.match(/\/rounds\/\d+\/draft/)) {
                return Promise.resolve({ data: { data: { round_draft: null } } });
            }
            if (url.includes('voice-aliases')) {
                return Promise.resolve(aliasesResponse);
            }
            return Promise.resolve(elementsResponse);
        };

        beforeEach(() => {
            // Stub window.webkitSpeechRecognition so voiceSupported is true
            // and the + button is rendered.
            vi.stubGlobal('webkitSpeechRecognition', vi.fn());
            api.put = vi.fn().mockResolvedValue({});
            api.get.mockImplementation(mockDraftElementsAndAliases);
        });

        afterEach(() => {
            vi.unstubAllGlobals();
        });

        it('renders the Manage voice aliases button when voice is supported', async () => {
            render(
                <RoundsCard initialTeams={[teamA, teamB]} initialRounds={[]} selectedGame={selectedGame} />,
            );

            await screen.findAllByLabelText('Burako');

            expect(
                screen.getByRole('button', { name: 'Manage voice aliases' }),
            ).toBeInTheDocument();
        });

        it('clicking the + button shows the VoiceAliasManager panel', async () => {
            const user = userEvent.setup();

            render(
                <RoundsCard initialTeams={[teamA, teamB]} initialRounds={[]} selectedGame={selectedGame} />,
            );

            await screen.findAllByLabelText('Burako');

            await user.click(screen.getByRole('button', { name: 'Manage voice aliases' }));

            // The heading inside VoiceAliasManager should now be visible.
            expect(screen.getByRole('heading', { name: /voice aliases/i })).toBeInTheDocument();
            // The add form inputs must be present.
            expect(screen.getByLabelText(/misheard/i)).toBeInTheDocument();
            expect(screen.getByLabelText(/intended/i)).toBeInTheDocument();
            // Empty state message since no aliases exist yet.
            expect(screen.getByText(/no aliases yet/i)).toBeInTheDocument();
        });

        it('clicking the + button again hides the VoiceAliasManager panel', async () => {
            const user = userEvent.setup();

            render(
                <RoundsCard initialTeams={[teamA, teamB]} initialRounds={[]} selectedGame={selectedGame} />,
            );

            await screen.findAllByLabelText('Burako');

            const aliasBtn = screen.getByRole('button', { name: 'Manage voice aliases' });

            await user.click(aliasBtn);
            expect(screen.getByRole('heading', { name: /voice aliases/i })).toBeInTheDocument();

            await user.click(screen.getByRole('button', { name: 'Hide voice aliases' }));
            expect(screen.queryByRole('heading', { name: /voice aliases/i })).not.toBeInTheDocument();
        });

        it('the score entry form remains visible while the alias panel is open', async () => {
            const user = userEvent.setup();

            render(
                <RoundsCard initialTeams={[teamA, teamB]} initialRounds={[]} selectedGame={selectedGame} />,
            );

            const burakoCheckboxes = await screen.findAllByLabelText('Burako');

            await user.click(screen.getByRole('button', { name: 'Manage voice aliases' }));

            // Both team scoring inputs are still rendered alongside the alias panel.
            expect(screen.getAllByLabelText('Burako')).toHaveLength(2);
            // Submit button is also still present.
            expect(screen.getByRole('button', { name: 'Record Round' })).toBeInTheDocument();

            void burakoCheckboxes; // suppress unused-variable lint
        });
    });

    describe('mic error feedback persistence', () => {
        let MockRecognition;

        function makeMockRecognition() {
            const instances = [];
            const Ctor = vi.fn(function () {
                this.continuous = false;
                this.interimResults = false;
                this.lang = '';
                this.start = vi.fn();
                this.abort = vi.fn();
                this.onstart = null;
                this.onresult = null;
                this.onerror = null;
                this.onend = null;
                instances.push(this);
            });
            Ctor.instances = instances;
            return Ctor;
        }

        const mockGetAndDraft = (url) => {
            if (url.includes('round-draft') || url.match(/\/rounds\/\d+\/draft/)) {
                return Promise.resolve({ data: { data: { round_draft: null } } });
            }
            if (url.includes('voice-aliases')) {
                return Promise.resolve({ data: { data: [] } });
            }
            return Promise.resolve(elementsResponse);
        };

        beforeEach(() => {
            MockRecognition = makeMockRecognition();
            vi.stubGlobal('webkitSpeechRecognition', MockRecognition);
            api.get.mockImplementation(mockGetAndDraft);
        });

        afterEach(() => {
            vi.unstubAllGlobals();
        });

        it('error feedback stays visible after the 3.5 s window', async () => {
            vi.useFakeTimers();

            render(
                <RoundsCard initialTeams={[teamA, teamB]} initialRounds={[]} selectedGame={selectedGame} />,
            );

            await act(async () => {
                await Promise.resolve();
            });

            // Start listening, then fire an error.
            act(() => {
                screen.getByRole('button', { name: 'Start voice command' }).click();
            });

            act(() => {
                MockRecognition.instances[0].onerror({ error: 'no-speech' });
                MockRecognition.instances[0].onend();
            });

            // Advance well past the 3.5 s auto-dismiss window.
            act(() => { vi.advanceTimersByTime(5000); });

            expect(screen.getByText('Failed!')).toBeInTheDocument();

            vi.useRealTimers();
        });

        it('error feedback is cleared when the mic button is clicked again', async () => {
            render(
                <RoundsCard initialTeams={[teamA, teamB]} initialRounds={[]} selectedGame={selectedGame} />,
            );

            await act(async () => {
                await Promise.resolve();
            });

            const micBtn = screen.getByRole('button', { name: 'Start voice command' });

            // Start listening, fire an error, let recognition end.
            act(() => { micBtn.click(); });
            act(() => {
                MockRecognition.instances[0].onerror({ error: 'no-speech' });
                MockRecognition.instances[0].onend();
            });

            expect(screen.getByText('Failed!')).toBeInTheDocument();

            // Click mic again — error should disappear immediately.
            act(() => { screen.getByRole('button', { name: 'Start voice command' }).click(); });

            expect(screen.queryByText('Failed!')).not.toBeInTheDocument();
        });

        it('success feedback still auto-dismisses after 3.5 s', async () => {
            vi.useFakeTimers();

            render(
                <RoundsCard initialTeams={[teamA, teamB]} initialRounds={[]} selectedGame={selectedGame} />,
            );

            await act(async () => {
                await Promise.resolve();
            });

            act(() => {
                screen.getByRole('button', { name: 'Start voice command' }).click();
            });

            act(() => {
                MockRecognition.instances[0].onresult({
                    results: [[{ transcript: 'save round' }]],
                });
                MockRecognition.instances[0].onend();
            });

            // The feedback should be gone after 3.5 s.
            await act(async () => { vi.advanceTimersByTime(3500); });

            expect(screen.queryByText('Done!')).not.toBeInTheDocument();

            vi.useRealTimers();
        });
    });

    it('shows live read-only scoring preview and hides Record Round button when user role is viewer', async () => {
        const viewerGame = { id: 5, name: 'Friday Table', target_points: 2000, user_role: 'viewer' };

        render(
            <RoundsCard
                hasTwoTeams
                initialRounds={[]}
                initialTeams={[teamA, teamB]}
                selectedGame={viewerGame}
            />,
        );

        // The "Live" badge is rendered in the viewer mode header.
        await screen.findByText('Live');
        // No editable Record Round button is present for viewers.
        expect(screen.queryByRole('button', { name: 'Record Round' })).not.toBeInTheDocument();
        // Read-only inputs are rendered (no stepper buttons visible).
        expect(screen.queryByRole('button', { name: /increase|decrease/i })).not.toBeInTheDocument();
        // Round and Total score labels are shown in each team card.
        const roundLabels = screen.getAllByText('Round:');
        const totalLabels = screen.getAllByText('Total:');
        expect(roundLabels).toHaveLength(2);
        expect(totalLabels).toHaveLength(2);
    });

    it('shows correct round and total score chips in the viewer UI based on accrued rounds and live draft', async () => {
        const viewerGame = { id: 5, name: 'Friday Table', target_points: 2000, user_role: 'viewer' };

        // Burako (100 pts boolean) checked for teamA in the draft
        api.get.mockImplementation((url) => {
            if (url.includes('/round-draft')) {
                return Promise.resolve({
                    data: {
                        data: {
                            round_draft: {
                                base_inputs: {
                                    [teamA.id]: { [baseElements[0].id]: true, [baseElements[1].id]: 0 },
                                    [teamB.id]: { [baseElements[0].id]: false, [baseElements[1].id]: 0 },
                                },
                                card_inputs: {
                                    [teamA.id]: { cardsInHand: 0, cardsOnTable: 0 },
                                    [teamB.id]: { cardsInHand: 0, cardsOnTable: 0 },
                                },
                            },
                        },
                    },
                });
            }
            return Promise.resolve(elementsResponse);
        });

        render(
            <RoundsCard
                hasTwoTeams
                initialRounds={[round1]}
                initialTeams={[teamA, teamB]}
                selectedGame={viewerGame}
            />,
        );

        await screen.findByText('Live');

        // teamA accrued = 100 (round1), roundScore = 100 (burako checked), total = 200
        // teamB accrued = 400 (round1), roundScore = 0 (nothing checked), total = 400
        await waitFor(() => {
            const chips = screen.getAllByTitle('This round\'s score');
            expect(chips[0]).toHaveTextContent('100');
            expect(chips[1]).toHaveTextContent('0');
        });

        await waitFor(() => {
            const totalChips = screen.getAllByTitle('Accrued score + this round');
            expect(totalChips[0]).toHaveTextContent('200');
            expect(totalChips[1]).toHaveTextContent('400');
        });
    });

    describe('viewer circle toggle', () => {
        const viewerGame = { id: 5, name: 'Friday Table', target_points: 2000, user_role: 'viewer' };

        const teamAWithPlayers = {
            ...teamA,
            players: [
                { id: 1, user_id: null, display_name: 'Alice', seat_number: 1 },
                { id: 3, user_id: null, display_name: 'Carlos', seat_number: 3 },
            ],
        };
        const teamBWithPlayers = {
            ...teamB,
            players: [
                { id: 2, user_id: null, display_name: 'Bruno', seat_number: 2 },
                { id: 4, user_id: null, display_name: 'Diana', seat_number: 4 },
            ],
        };

        const roundRolesForNext = [
            {
                round_number: 1,
                cutter: { player_id: 1, display_name: 'Alice', seat_number: 1 },
                dealer: { player_id: 2, display_name: 'Bruno', seat_number: 2 },
                first_draw: { player_id: 3, display_name: 'Carlos', seat_number: 3 },
            },
        ];

        it('renders a circle toggle button for the current round in the viewer live panel', async () => {
            render(
                <RoundsCard
                    hasTwoTeams
                    initialRounds={[]}
                    initialTeams={[teamAWithPlayers, teamBWithPlayers]}
                    roundRoles={roundRolesForNext}
                    selectedGame={viewerGame}
                />,
            );

            await screen.findByText('Live');
            const circleBtn = screen.getByRole('button', {
                name: 'Show seating circle for round 1',
            });
            expect(circleBtn).toBeInTheDocument();
        });

        it('shows player names after clicking the circle toggle button in the viewer live panel', async () => {
            const user = userEvent.setup();

            render(
                <RoundsCard
                    hasTwoTeams
                    initialRounds={[]}
                    initialTeams={[teamAWithPlayers, teamBWithPlayers]}
                    roundRoles={roundRolesForNext}
                    selectedGame={viewerGame}
                />,
            );

            await screen.findByText('Live');
            await user.click(screen.getByRole('button', { name: 'Show seating circle for round 1' }));

            expect(screen.getByText('Alice')).toBeInTheDocument();
            expect(screen.getByText('Bruno')).toBeInTheDocument();
            expect(screen.getByText('Carlos')).toBeInTheDocument();
            expect(screen.getByText('Diana')).toBeInTheDocument();
        });

        it('circle toggle button label switches to "Hide" when viewer circle is open', async () => {
            const user = userEvent.setup();

            render(
                <RoundsCard
                    hasTwoTeams
                    initialRounds={[]}
                    initialTeams={[teamAWithPlayers, teamBWithPlayers]}
                    roundRoles={roundRolesForNext}
                    selectedGame={viewerGame}
                />,
            );

            await screen.findByText('Live');
            await user.click(screen.getByRole('button', { name: 'Show seating circle for round 1' }));

            expect(
                screen.getByRole('button', { name: 'Hide seating circle for round 1' }),
            ).toBeInTheDocument();
        });
    });

    describe('real-time draft updates via Echo', () => {
        let echoListenCallback;
        let mockLeave;
        let mockListen;
        let mockPrivate;

        beforeEach(() => {
            echoListenCallback = null;
            mockLeave = vi.fn();
            mockListen = vi.fn().mockImplementation((_event, cb) => {
                echoListenCallback = cb;
                return { listen: mockListen };
            });
            mockPrivate = vi.fn().mockReturnValue({ listen: mockListen });
            window.Echo = { private: mockPrivate, leave: mockLeave };
        });

        afterEach(() => {
            delete window.Echo;
        });

        it('subscribes to the private game channel on mount', async () => {
            render(
                <RoundsCard
                    hasTwoTeams
                    initialRounds={[]}
                    initialTeams={[teamA, teamB]}
                    selectedGame={selectedGame}
                />,
            );

            await screen.findAllByLabelText('Burako');

            expect(mockPrivate).toHaveBeenCalledWith(`game.${selectedGame.id}`);
            expect(mockListen).toHaveBeenCalledWith('.round.draft.updated', expect.any(Function));
        });

        it('leaves the game channel on unmount', async () => {
            const { unmount } = render(
                <RoundsCard
                    hasTwoTeams
                    initialRounds={[]}
                    initialTeams={[teamA, teamB]}
                    selectedGame={selectedGame}
                />,
            );

            await screen.findAllByLabelText('Burako');
            unmount();

            expect(mockLeave).toHaveBeenCalledWith(`game.${selectedGame.id}`);
        });

        it('updates base inputs when a round.draft.updated event is received', async () => {
            render(
                <RoundsCard
                    hasTwoTeams
                    initialRounds={[]}
                    initialTeams={[teamA, teamB]}
                    selectedGame={selectedGame}
                />,
            );

            const burakoCheckboxes = await screen.findAllByLabelText('Burako');
            expect(burakoCheckboxes[0]).not.toBeChecked();

            // Simulate receiving a real-time draft update with Burako checked for team A.
            await act(async () => {
                echoListenCallback({
                    base_inputs: {
                        [teamA.id]: { [baseElements[0].id]: true, [baseElements[1].id]: 0 },
                        [teamB.id]: { [baseElements[0].id]: false, [baseElements[1].id]: 0 },
                    },
                    card_inputs: {
                        [teamA.id]: { cardsInHand: 0, cardsOnTable: 0 },
                        [teamB.id]: { cardsInHand: 0, cardsOnTable: 0 },
                    },
                });
            });

            await waitFor(() => expect(burakoCheckboxes[0]).toBeChecked());
        });

        it('updates card inputs when a round.draft.updated event is received', async () => {
            render(
                <RoundsCard
                    hasTwoTeams
                    initialRounds={[]}
                    initialTeams={[teamA, teamB]}
                    selectedGame={selectedGame}
                />,
            );

            const inHandInputs = await screen.findAllByLabelText('Points in Hand');
            expect(inHandInputs[0]).toHaveValue(0);

            await act(async () => {
                echoListenCallback({
                    base_inputs: {
                        [teamA.id]: { [baseElements[0].id]: false, [baseElements[1].id]: 0 },
                        [teamB.id]: { [baseElements[0].id]: false, [baseElements[1].id]: 0 },
                    },
                    card_inputs: {
                        [teamA.id]: { cardsInHand: 15, cardsOnTable: 0 },
                        [teamB.id]: { cardsInHand: 0, cardsOnTable: 0 },
                    },
                });
            });

            await waitFor(() => expect(inHandInputs[0]).toHaveValue(15));
        });

        it('shows updated values in the viewer read-only preview when an event arrives', async () => {
            const viewerGame = { id: 5, name: 'Friday Table', target_points: 2000, user_role: 'viewer' };

            render(
                <RoundsCard
                    hasTwoTeams
                    initialRounds={[]}
                    initialTeams={[teamA, teamB]}
                    selectedGame={viewerGame}
                />,
            );

            await screen.findByText('Live');

            await act(async () => {
                echoListenCallback({
                    base_inputs: {
                        [teamA.id]: { [baseElements[0].id]: false, [baseElements[1].id]: 0 },
                        [teamB.id]: { [baseElements[0].id]: false, [baseElements[1].id]: 0 },
                    },
                    card_inputs: {
                        [teamA.id]: { cardsInHand: 7, cardsOnTable: 0 },
                        [teamB.id]: { cardsInHand: 0, cardsOnTable: 0 },
                    },
                });
            });

            // The read-only inputs should display the updated values.
            await waitFor(() => {
                const inHandInputs = screen.getAllByLabelText('Points in Hand');
                expect(inHandInputs[0]).toHaveValue(7);
            });
        });

        it('clears viewer inputs when a round-completion notification arrives (initialRounds grows)', async () => {
            const viewerGame = { id: 5, name: 'Friday Table', target_points: 2000, user_role: 'viewer' };

            const { rerender } = render(
                <RoundsCard
                    hasTwoTeams
                    initialRounds={[]}
                    initialTeams={[teamA, teamB]}
                    selectedGame={viewerGame}
                />,
            );

            await screen.findByText('Live');

            // Simulate a live draft update filling in the inputs
            await act(async () => {
                echoListenCallback({
                    base_inputs: {
                        [teamA.id]: { [baseElements[0].id]: false, [baseElements[1].id]: 3 },
                        [teamB.id]: { [baseElements[0].id]: false, [baseElements[1].id]: 1 },
                    },
                    card_inputs: {
                        [teamA.id]: { cardsInHand: 10, cardsOnTable: 5 },
                        [teamB.id]: { cardsInHand: 2, cardsOnTable: 0 },
                    },
                });
            });

            // Confirm inputs now have non-zero values
            await waitFor(() => {
                const inHandInputs = screen.getAllByLabelText('Points in Hand');
                expect(inHandInputs[0]).toHaveValue(10);
            });

            // Simulate a .game.updated notification: parent pushes a new round
            await act(async () => {
                rerender(
                    <RoundsCard
                        hasTwoTeams
                        initialRounds={[round1]}
                        initialTeams={[teamA, teamB]}
                        selectedGame={viewerGame}
                    />,
                );
            });

            // All scoring inputs must be cleared back to their defaults
            await waitFor(() => {
                const inHandInputs = screen.getAllByLabelText('Points in Hand');
                expect(inHandInputs[0]).toHaveValue(0);
                expect(inHandInputs[1]).toHaveValue(0);
                const onTableInputs = screen.getAllByLabelText('Points on Table');
                expect(onTableInputs[0]).toHaveValue(0);
                expect(onTableInputs[1]).toHaveValue(0);
            });
        });
    });

    // ─── Load Earlier Rounds ──────────────────────────────────────────────────

    describe('load earlier rounds', () => {
        it('shows "Load earlier rounds" button when initialHasMoreRounds is true', async () => {
            render(
                <RoundsCard
                    initialTeams={[teamA, teamB]}
                    initialRounds={[round1]}
                    initialHasMoreRounds={true}
                    selectedGame={selectedGame}
                />,
            );

            expect(await screen.findByRole('button', { name: /load earlier rounds/i })).toBeInTheDocument();
        });

        it('does not show "Load earlier rounds" button when initialHasMoreRounds is false', async () => {
            render(
                <RoundsCard
                    initialTeams={[teamA, teamB]}
                    initialRounds={[round1]}
                    initialHasMoreRounds={false}
                    selectedGame={selectedGame}
                />,
            );

            // Consume the base-elements GET so no pending state updates remain.
            await screen.findAllByText('Team Alpha');
            expect(screen.queryByRole('button', { name: /load earlier rounds/i })).not.toBeInTheDocument();
        });

        it('calls GET /games/{id}/rounds with before_round and limit params when button is clicked', async () => {
            const earlierRound = {
                round_number: 0,
                scores: [
                    { team_id: 10, team_name: 'Team Alpha', points: 50 },
                    { team_id: 11, team_name: 'Team Beta', points: 70 },
                ],
            };

            // First GET is base-elements; second is the rounds pagination call.
            api.get.mockImplementation((url) => {
                if (url === '/base-elements') return Promise.resolve(elementsResponse);
                if (url.includes('/rounds')) return Promise.resolve({
                    data: { data: { rounds: { items: [earlierRound], has_more: false } } },
                });
                return Promise.reject(new Error(`Unexpected GET: ${url}`));
            });

            render(
                <RoundsCard
                    initialTeams={[teamA, teamB]}
                    initialRounds={[round1]}
                    initialHasMoreRounds={true}
                    selectedGame={selectedGame}
                />,
            );

            const btn = await screen.findByRole('button', { name: /load earlier rounds/i });
            await userEvent.click(btn);

            await waitFor(() => {
                const roundsCalls = api.get.mock.calls.filter(([url]) => url.includes('/rounds'));
                expect(roundsCalls).toHaveLength(1);
                expect(roundsCalls[0][0]).toBe(`/games/${selectedGame.id}/rounds`);
                expect(roundsCalls[0][1].params.before_round).toBe(1); // earliest loaded round_number
                expect(roundsCalls[0][1].params.limit).toBe(25);
            });
        });

        it('prepends fetched rounds to the history table', async () => {
            const round0 = {
                round_number: 0,
                scores: [
                    { team_id: 10, team_name: 'Team Alpha', points: 50 },
                    { team_id: 11, team_name: 'Team Beta', points: 70 },
                ],
            };

            api.get.mockImplementation((url) => {
                if (url === '/base-elements') return Promise.resolve(elementsResponse);
                return Promise.resolve({
                    data: { data: { rounds: { items: [round0], has_more: false } } },
                });
            });

            render(
                <RoundsCard
                    initialTeams={[teamA, teamB]}
                    initialRounds={[round1]}
                    initialHasMoreRounds={true}
                    selectedGame={selectedGame}
                />,
            );

            await userEvent.click(await screen.findByRole('button', { name: /load earlier rounds/i }));

            // Round 0 is prepended; round 1 remains. Both appear.
            await waitFor(() => {
                const rows = screen.getAllByRole('row');
                const rowTexts = rows.map((r) => r.textContent);
                expect(rowTexts.some((t) => t.includes('0'))).toBe(true);
                expect(rowTexts.some((t) => t.includes('1'))).toBe(true);
            });
        });

        it('hides the "Load earlier rounds" button after has_more becomes false', async () => {
            api.get.mockImplementation((url) => {
                if (url === '/base-elements') return Promise.resolve(elementsResponse);
                return Promise.resolve({
                    data: { data: { rounds: { items: [], has_more: false } } },
                });
            });

            render(
                <RoundsCard
                    initialTeams={[teamA, teamB]}
                    initialRounds={[round1]}
                    initialHasMoreRounds={true}
                    selectedGame={selectedGame}
                />,
            );

            await userEvent.click(await screen.findByRole('button', { name: /load earlier rounds/i }));

            await waitFor(() => {
                expect(screen.queryByRole('button', { name: /load earlier rounds/i })).not.toBeInTheDocument();
            });
        });

        it('keeps existing rounds intact on API error', async () => {
            api.get.mockImplementation((url) => {
                if (url === '/base-elements') return Promise.resolve(elementsResponse);
                return Promise.reject(new Error('Network error'));
            });

            render(
                <RoundsCard
                    initialTeams={[teamA, teamB]}
                    initialRounds={[round1]}
                    initialHasMoreRounds={true}
                    selectedGame={selectedGame}
                />,
            );

            await userEvent.click(await screen.findByRole('button', { name: /load earlier rounds/i }));

            // Button should still be present and round 1 still rendered.
            await waitFor(() => {
                expect(screen.getByRole('button', { name: /load earlier rounds/i })).toBeInTheDocument();
            });
            expect(screen.getByText('1')).toBeInTheDocument();
        });
    });

});

