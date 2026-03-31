import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ViewerRoundPanel from '@/Components/ViewerRoundPanel';

vi.mock('@/Components/BaseElementsInput', () => ({
    default: ({ readOnly, showBaseElements, teamId }) => (
        <div
            data-testid={`base-elements-input-${teamId}`}
            data-readonly={readOnly}
            data-show-base-elements={showBaseElements !== false ? 'true' : 'false'}
        />
    ),
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

    it('shows the "Live" badge when isCreatorLive is true', () => {
        render(<ViewerRoundPanel {...baseProps} isCreatorLive />);
        const badge = screen.getByLabelText('Receiving live score updates');
        expect(badge).toBeInTheDocument();
        expect(badge).toHaveClass('opacity-100');
    });

    it('hides the "Live" badge when isCreatorLive is false', () => {
        render(<ViewerRoundPanel {...baseProps} />);
        const badge = screen.getByLabelText('Receiving live score updates');
        expect(badge).toBeInTheDocument();
        expect(badge).toHaveClass('opacity-0');
    });

    it('renders both team names', () => {
        render(<ViewerRoundPanel {...baseProps} />);
        expect(screen.getByText('Team Alpha')).toBeInTheDocument();
        expect(screen.getByText('Team Beta')).toBeInTheDocument();
    });

    it('renders a BaseElementsInput in readOnly mode for each team', () => {
        render(<ViewerRoundPanel {...baseProps} />);
        const inputAlpha = screen.getByTestId('base-elements-input-10');
        const inputBeta = screen.getByTestId('base-elements-input-11');
        expect(inputAlpha).toHaveAttribute('data-readonly', 'true');
        expect(inputBeta).toHaveAttribute('data-readonly', 'true');
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

    describe('team collapse', () => {
        it('renders a collapse button for each team when circle is closed', () => {
            render(<ViewerRoundPanel {...baseProps} />);
            expect(
                screen.getByRole('button', { name: 'Collapse Team Alpha score inputs' }),
            ).toBeInTheDocument();
            expect(
                screen.getByRole('button', { name: 'Collapse Team Beta score inputs' }),
            ).toBeInTheDocument();
        });

        it('passes showBaseElements=true to BaseElementsInput by default', () => {
            render(<ViewerRoundPanel {...baseProps} />);
            expect(screen.getByTestId('base-elements-input-10')).toHaveAttribute('data-show-base-elements', 'true');
            expect(screen.getByTestId('base-elements-input-11')).toHaveAttribute('data-show-base-elements', 'true');
        });

        it('passes showBaseElements=false after collapsing a team', async () => {
            const user = userEvent.setup();
            render(<ViewerRoundPanel {...baseProps} />);

            await user.click(screen.getByRole('button', { name: 'Collapse Team Alpha score inputs' }));

            expect(screen.getByTestId('base-elements-input-10')).toHaveAttribute('data-show-base-elements', 'false');
            // The other team remains expanded
            expect(screen.getByTestId('base-elements-input-11')).toHaveAttribute('data-show-base-elements', 'true');
        });

        it('expands the team again after a second click', async () => {
            const user = userEvent.setup();
            render(<ViewerRoundPanel {...baseProps} />);

            await user.click(screen.getByRole('button', { name: 'Collapse Team Alpha score inputs' }));
            await user.click(screen.getByRole('button', { name: 'Expand Team Alpha score inputs' }));

            expect(screen.getByTestId('base-elements-input-10')).toHaveAttribute('data-show-base-elements', 'true');
        });

        it('collapse button has aria-expanded=true when team is expanded', () => {
            render(<ViewerRoundPanel {...baseProps} />);
            expect(
                screen.getByRole('button', { name: 'Collapse Team Alpha score inputs' }),
            ).toHaveAttribute('aria-expanded', 'true');
        });

        it('collapse button has aria-expanded=false when team is collapsed', async () => {
            const user = userEvent.setup();
            render(<ViewerRoundPanel {...baseProps} />);

            await user.click(screen.getByRole('button', { name: 'Collapse Team Alpha score inputs' }));

            expect(
                screen.getByRole('button', { name: 'Expand Team Alpha score inputs' }),
            ).toHaveAttribute('aria-expanded', 'false');
        });

        it('does not render collapse buttons when the circle is open', () => {
            render(<ViewerRoundPanel {...baseProps} activeCircleRound={3} />);
            expect(
                screen.queryByRole('button', { name: /score inputs/i }),
            ).not.toBeInTheDocument();
        });
    });
});
