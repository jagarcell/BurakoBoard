import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ViewerRoundPanel from '@/Components/ViewerRoundPanel';

vi.mock('@/Components/BaseElementsInput', () => ({
    default: ({ readOnly }) => <div data-testid="base-elements-input" data-readonly={readOnly} />,
}));

vi.mock('@/Components/PlayerCircle', () => ({
    default: ({ roundNumber }) => <div data-testid={`player-circle-${roundNumber}`} />,
}));

const teams = [
    { id: 10, name: 'Team Alpha', players: [{ id: 1, display_name: 'Alice', seat_number: 1 }] },
    { id: 11, name: 'Team Beta', players: [{ id: 2, display_name: 'Bob', seat_number: 2 }] },
];

const baseElements = [
    { id: 1, name: 'burako', label: 'Burako', points: 100, input_type: 'boolean' },
];

const baseProps = {
    teams,
    elements: baseElements,
    baseInputs: { 10: {}, 11: {} },
    cardInputs: { 10: {}, 11: {} },
    nextRound: 3,
    currentRoundRolesForPanel: null,
    activeCircleRound: null,
    closingCircleRound: null,
    circleButtonRect: null,
    computeTeamScore: () => 0,
    getAccruedScore: () => 0,
    onToggleCircle: vi.fn(),
};

describe('ViewerRoundPanel', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders the round number', () => {
        render(<ViewerRoundPanel {...baseProps} />);
        expect(screen.getByText(/round 3/i)).toBeInTheDocument();
    });

    it('shows the "Live" badge', () => {
        render(<ViewerRoundPanel {...baseProps} />);
        expect(screen.getByText('Live')).toBeInTheDocument();
    });

    it('renders both team names', () => {
        render(<ViewerRoundPanel {...baseProps} />);
        expect(screen.getByText('Team Alpha')).toBeInTheDocument();
        expect(screen.getByText('Team Beta')).toBeInTheDocument();
    });

    it('renders a BaseElementsInput in readOnly mode for each team', () => {
        render(<ViewerRoundPanel {...baseProps} />);
        const inputs = screen.getAllByTestId('base-elements-input');
        expect(inputs).toHaveLength(2);
        inputs.forEach((el) => expect(el).toHaveAttribute('data-readonly', 'true'));
    });

    it('renders the circle toggle button with correct aria-expanded=false when circle is not open', () => {
        render(<ViewerRoundPanel {...baseProps} />);
        const btn = screen.getByRole('button', {
            name: /show seating circle for round 3/i,
        });
        expect(btn).toHaveAttribute('aria-expanded', 'false');
    });

    it('renders the circle toggle button with aria-expanded=true when the circle is open', () => {
        render(<ViewerRoundPanel {...baseProps} activeCircleRound={3} />);
        const btn = screen.getByRole('button', {
            name: /hide seating circle for round 3/i,
        });
        expect(btn).toHaveAttribute('aria-expanded', 'true');
    });

    it('calls onToggleCircle with the event and round number when the circle button is clicked', () => {
        render(<ViewerRoundPanel {...baseProps} />);
        const btn = screen.getByRole('button', { name: /seating circle for round 3/i });
        fireEvent.click(btn);
        expect(baseProps.onToggleCircle).toHaveBeenCalledWith(expect.anything(), 3);
    });

    it('shows the PlayerCircle when activeCircleRound matches nextRound', () => {
        render(<ViewerRoundPanel {...baseProps} activeCircleRound={3} />);
        expect(screen.getByTestId('player-circle-3')).toBeInTheDocument();
    });

    it('hides team tiles when the circle is open', () => {
        render(<ViewerRoundPanel {...baseProps} activeCircleRound={3} />);
        expect(screen.queryByText('Team Alpha')).not.toBeInTheDocument();
    });

    it('shows team tiles when the circle is not open', () => {
        render(<ViewerRoundPanel {...baseProps} activeCircleRound={null} />);
        expect(screen.getByText('Team Alpha')).toBeInTheDocument();
        expect(screen.getByText('Team Beta')).toBeInTheDocument();
    });

    it('shows the PlayerCircle when closingCircleRound matches nextRound', () => {
        render(<ViewerRoundPanel {...baseProps} closingCircleRound={3} />);
        expect(screen.getByTestId('player-circle-3')).toBeInTheDocument();
    });

    it('renders score chips for each team', () => {
        const computeTeamScore = vi.fn(() => 120);
        const getAccruedScore = vi.fn(() => 400);
        render(
            <ViewerRoundPanel
                {...baseProps}
                computeTeamScore={computeTeamScore}
                getAccruedScore={getAccruedScore}
            />,
        );
        // 520 = accrued 400 + round 120 for each team
        expect(screen.getAllByText('520')).toHaveLength(2);
    });
});
