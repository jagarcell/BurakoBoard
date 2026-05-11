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
        // Team names appear in both the mobile tab selector and the card header
        expect(screen.getAllByText('Team Alpha').length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText('Team Beta').length).toBeGreaterThanOrEqual(1);
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
        // Team names appear in both the mobile tab selector and the card header
        expect(screen.getAllByText('Team Alpha').length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText('Team Beta').length).toBeGreaterThanOrEqual(1);
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
        // 520 = accrued 400 + round 120; appears in both mobile tab chips and card header chips
        expect(screen.getAllByText('520').length).toBeGreaterThanOrEqual(2);
    });

    describe('mobile team tab selector', () => {
        it('renders a tab button for each team when circle is closed', () => {
            render(<ViewerRoundPanel {...baseProps} />);
            expect(
                screen.getByRole('button', { name: 'Show Team Alpha score inputs' }),
            ).toBeInTheDocument();
            expect(
                screen.getByRole('button', { name: 'Show Team Beta score inputs' }),
            ).toBeInTheDocument();
        });

        it('first team tab is active by default (aria-pressed=true)', () => {
            render(<ViewerRoundPanel {...baseProps} />);
            expect(
                screen.getByRole('button', { name: 'Show Team Alpha score inputs' }),
            ).toHaveAttribute('aria-pressed', 'true');
            expect(
                screen.getByRole('button', { name: 'Show Team Beta score inputs' }),
            ).toHaveAttribute('aria-pressed', 'false');
        });

        it('clicking Team Beta tab marks it as active', async () => {
            const user = userEvent.setup();
            render(<ViewerRoundPanel {...baseProps} />);

            await user.click(screen.getByRole('button', { name: 'Show Team Beta score inputs' }));

            expect(
                screen.getByRole('button', { name: 'Show Team Beta score inputs' }),
            ).toHaveAttribute('aria-pressed', 'true');
            expect(
                screen.getByRole('button', { name: 'Show Team Alpha score inputs' }),
            ).toHaveAttribute('aria-pressed', 'false');
        });

        it('passes showBaseElements=true to all BaseElementsInput instances', () => {
            render(<ViewerRoundPanel {...baseProps} />);
            expect(screen.getByTestId('base-elements-input-10')).toHaveAttribute('data-show-base-elements', 'true');
            expect(screen.getByTestId('base-elements-input-11')).toHaveAttribute('data-show-base-elements', 'true');
        });

        it('does not render tab buttons when the circle is open', () => {
            render(<ViewerRoundPanel {...baseProps} activeCircleRound={3} />);
            expect(
                screen.queryByRole('button', { name: /score inputs/i }),
            ).not.toBeInTheDocument();
        });
    });

    describe('points remaining to goal chips', () => {
        it('shows Rem chips in the desktop tile header when score is below targetPoints', () => {
            const computeTeamScore = vi.fn(() => 0);
            const getAccruedScore = vi.fn(() => 300);
            render(
                <ViewerRoundPanel
                    {...baseProps}
                    computeTeamScore={computeTeamScore}
                    getAccruedScore={getAccruedScore}
                    targetPoints={2000}
                />,
            );
            // partial=300, rem=1700 — shown in both mobile tab and desktop tile
            const chips = screen.getAllByTitle('Points remaining to reach the game goal');
            expect(chips.length).toBeGreaterThanOrEqual(2);
            chips.forEach((c) => expect(c).toHaveTextContent('-1700'));
        });

        it('does not show Rem chips when targetPoints is null', () => {
            render(
                <ViewerRoundPanel
                    {...baseProps}
                    computeTeamScore={() => 0}
                    getAccruedScore={() => 300}
                    targetPoints={null}
                />,
            );
            expect(screen.queryByTitle('Points remaining to reach the game goal')).not.toBeInTheDocument();
        });

        it('does not show Rem chips when the partial score meets or exceeds targetPoints', () => {
            render(
                <ViewerRoundPanel
                    {...baseProps}
                    computeTeamScore={() => 0}
                    getAccruedScore={() => 2000}
                    targetPoints={2000}
                />,
            );
            expect(screen.queryByTitle('Points remaining to reach the game goal')).not.toBeInTheDocument();
        });
    });
});
