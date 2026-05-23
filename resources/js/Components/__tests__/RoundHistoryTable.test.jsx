import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RoundHistoryTable from '@/Components/RoundHistoryTable';

vi.mock('@/Components/BaseElementsInput', () => ({
    default: ({ teamId, readOnly }) => (
        <div data-testid={`base-elements-input-${teamId}`} data-readonly={readOnly} />
    ),
}));

vi.mock('@/Components/PlayerCircle', () => ({
    default: ({ roundNumber }) => <div data-testid={`player-circle-${roundNumber}`} />,
}));

const teams = [
    { id: 10, name: 'Team Alpha' },
    { id: 11, name: 'Team Beta' },
];

const rounds = [
    {
        round_number: 1,
        scores: [
            { team_id: 10, points: 300 },
            { team_id: 11, points: -50 },
        ],
    },
    {
        round_number: 2,
        scores: [
            { team_id: 10, points: 100 },
            { team_id: 11, points: 200 },
        ],
    },
];

const baseProps = {
    rounds,
    teams,
    roundRoles: [],
    elements: [{ id: 1, name: 'burako', label: 'Burako', points: 100, input_type: 'boolean' }],
    roundDraftCache: {},
    loadingDraftRound: null,
    expandedRound: null,
    activeCircleRound: null,
    closingCircleRound: null,
    circleButtonRect: null,
    hasMoreRounds: false,
    isLoadingMoreRounds: false,
    onExpandRound: vi.fn(),
    onToggleCircle: vi.fn(),
    onLoadEarlier: vi.fn(),
    onSaveAmend: vi.fn().mockResolvedValue(true),
};

describe('RoundHistoryTable', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('shows "No rounds recorded yet" when rounds array is empty', () => {
        render(<RoundHistoryTable {...baseProps} rounds={[]} />);
        expect(screen.getByText(/no rounds recorded yet/i)).toBeInTheDocument();
    });

    it('renders team names as table column headers', () => {
        render(<RoundHistoryTable {...baseProps} />);
        expect(screen.getByRole('columnheader', { name: /team alpha/i })).toBeInTheDocument();
        expect(screen.getByRole('columnheader', { name: /team beta/i })).toBeInTheDocument();
    });

    it('renders a row for each round', () => {
        render(<RoundHistoryTable {...baseProps} />);
        expect(screen.getByText('1')).toBeInTheDocument();
        expect(screen.getByText('2')).toBeInTheDocument();
    });

    it('renders score badges for each team per round', () => {
        render(<RoundHistoryTable {...baseProps} />);
        expect(screen.getByText('300')).toBeInTheDocument();
        expect(screen.getByText('-50')).toBeInTheDocument();
        expect(screen.getByText('100')).toBeInTheDocument();
        expect(screen.getByText('200')).toBeInTheDocument();
    });

    it('hides the "Load earlier rounds" button when hasMoreRounds is false', () => {
        render(<RoundHistoryTable {...baseProps} hasMoreRounds={false} />);
        expect(
            screen.queryByRole('button', { name: /load earlier rounds/i }),
        ).not.toBeInTheDocument();
    });

    it('shows the "Load earlier rounds" button when hasMoreRounds is true', () => {
        render(<RoundHistoryTable {...baseProps} hasMoreRounds />);
        expect(
            screen.getByRole('button', { name: /load earlier rounds/i }),
        ).toBeInTheDocument();
    });

    it('calls onLoadEarlier when the "Load earlier rounds" button is clicked', () => {
        render(<RoundHistoryTable {...baseProps} hasMoreRounds />);
        fireEvent.click(screen.getByRole('button', { name: /load earlier rounds/i }));
        expect(baseProps.onLoadEarlier).toHaveBeenCalledTimes(1);
    });

    it('disables the "Load earlier rounds" button while loading', () => {
        render(<RoundHistoryTable {...baseProps} hasMoreRounds isLoadingMoreRounds />);
        expect(
            screen.getByRole('button', { name: /load earlier rounds|loading/i }),
        ).toBeDisabled();
    });

    it('calls onExpandRound with the round number when the expand button is clicked', () => {
        render(<RoundHistoryTable {...baseProps} />);
        const expandBtn = screen.getByRole('button', {
            name: /expand round 1 detail/i,
        });
        fireEvent.click(expandBtn);
        expect(baseProps.onExpandRound).toHaveBeenCalledWith(1);
    });

    it('shows the detail panel when expandedRound matches a round number', () => {
        render(
            <RoundHistoryTable
                {...baseProps}
                expandedRound={1}
                roundDraftCache={{ 1: { base_inputs: { 10: {}, 11: {} }, card_inputs: { 10: {}, 11: {} } } }}
            />,
        );
        expect(screen.getByText(/round 1 — scoring detail/i)).toBeInTheDocument();
    });

    it('does not show the detail panel when expandedRound does not match', () => {
        render(<RoundHistoryTable {...baseProps} expandedRound={null} />);
        expect(screen.queryByText(/scoring detail/i)).not.toBeInTheDocument();
    });

    it('calls onToggleCircle with event and round number when the circle button is clicked', () => {
        render(<RoundHistoryTable {...baseProps} />);
        const circleBtn = screen.getByRole('button', {
            name: /show seating circle for round 1/i,
        });
        fireEvent.click(circleBtn);
        expect(baseProps.onToggleCircle).toHaveBeenCalledWith(expect.anything(), 1);
    });

    it('shows the PlayerCircle when activeCircleRound matches a round', () => {
        render(<RoundHistoryTable {...baseProps} activeCircleRound={2} />);
        expect(screen.getByTestId('player-circle-2')).toBeInTheDocument();
    });

    it('renders BaseElementsInput in the expanded detail row', () => {
        const roundDraftCache = {
            1: {
                base_inputs: { 10: { burako: 1 }, 11: {} },
                card_inputs: { 10: {}, 11: {} },
            },
        };
        render(
            <RoundHistoryTable {...baseProps} expandedRound={1} roundDraftCache={roundDraftCache} />,
        );
        const inputs = screen.getAllByTestId(/base-elements-input-hist/);
        expect(inputs.length).toBeGreaterThanOrEqual(1);
        inputs.forEach((el) => expect(el).toHaveAttribute('data-readonly', 'true'));
    });

    it('shows an orange Amend button when a closed round is inspected', () => {
        const roundDraftCache = {
            1: {
                base_inputs: { 10: {}, 11: {} },
                card_inputs: { 10: {}, 11: {} },
            },
        };

        render(
            <RoundHistoryTable {...baseProps} expandedRound={1} roundDraftCache={roundDraftCache} />,
        );

        const amendButton = screen.getByRole('button', { name: /amend round 1/i });
        expect(amendButton).toBeInTheDocument();
        expect(amendButton).toHaveClass('bg-orange-500');
        expect(amendButton).toHaveTextContent('Amend');
    });

    it('enables edit mode for inspected round detail after clicking Amend', () => {
        const roundDraftCache = {
            1: {
                base_inputs: { 10: {}, 11: {} },
                card_inputs: { 10: {}, 11: {} },
            },
        };

        render(
            <RoundHistoryTable {...baseProps} expandedRound={1} roundDraftCache={roundDraftCache} />,
        );

        const amendButton = screen.getByRole('button', { name: /amend round 1/i });
        fireEvent.click(amendButton);

        const inputs = screen.getAllByTestId(/base-elements-input-hist/);
        inputs.forEach((el) => expect(el).toHaveAttribute('data-readonly', 'false'));
    });

    it('calls onSaveAmend when Save Amend is clicked in amend mode', async () => {
        const roundDraftCache = {
            1: {
                base_inputs: { 10: {}, 11: {} },
                card_inputs: { 10: { cardsInHand: 0, cardsOnTable: 0 }, 11: { cardsInHand: 0, cardsOnTable: 0 } },
            },
        };

        render(
            <RoundHistoryTable {...baseProps} expandedRound={1} roundDraftCache={roundDraftCache} />,
        );

        await userEvent.click(screen.getByRole('button', { name: /amend round 1/i }));
        await userEvent.click(screen.getByRole('button', { name: /save amendment for round 1/i }));

        await waitFor(() => {
            expect(baseProps.onSaveAmend).toHaveBeenCalledTimes(1);
            expect(baseProps.onSaveAmend).toHaveBeenCalledWith(
                1,
                expect.objectContaining({
                    scores: expect.any(Array),
                    base_inputs: expect.any(Object),
                    card_inputs: expect.any(Object),
                }),
            );
        });
    });
});
