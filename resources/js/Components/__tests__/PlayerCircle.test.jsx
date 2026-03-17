import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import PlayerCircle from '@/Components/PlayerCircle';

const players = [
    { id: 1, display_name: 'Alice', seat_number: 1 },
    { id: 2, display_name: 'Bob', seat_number: 2 },
    { id: 3, display_name: 'Charlie', seat_number: 3 },
    { id: 4, display_name: 'Diana', seat_number: 4 },
];

const roundRoles = {
    round_number: 1,
    shuffler: { player_id: 1, display_name: 'Alice', seat_number: 1 },
    cutter: { player_id: 2, display_name: 'Bob', seat_number: 2 },
    dealer: { player_id: 3, display_name: 'Charlie', seat_number: 3 },
    first_draw: { player_id: 4, display_name: 'Diana', seat_number: 4 },
};

describe('PlayerCircle', () => {
    it('renders a chip for every seated player', () => {
        render(<PlayerCircle players={players} roundNumber={1} roundRoles={roundRoles} />);

        expect(screen.getByText('Alice')).toBeInTheDocument();
        expect(screen.getByText('Bob')).toBeInTheDocument();
        expect(screen.getByText('Charlie')).toBeInTheDocument();
        expect(screen.getByText('Diana')).toBeInTheDocument();
    });

    it('shows seat number for each player', () => {
        render(<PlayerCircle players={players} roundNumber={1} roundRoles={roundRoles} />);

        expect(screen.getByText('#1')).toBeInTheDocument();
        expect(screen.getByText('#2')).toBeInTheDocument();
        expect(screen.getByText('#3')).toBeInTheDocument();
        expect(screen.getByText('#4')).toBeInTheDocument();
    });

    it('shows role badges for players with assigned roles', () => {
        render(<PlayerCircle players={players} roundNumber={1} roundRoles={roundRoles} />);

        expect(screen.getAllByText('Shuffler').length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText('Cutter').length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText('Dealer').length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText('First Draw').length).toBeGreaterThanOrEqual(1);
    });

    it('displays the correct round number in the centre badge', () => {
        render(<PlayerCircle players={players} roundNumber={3} roundRoles={roundRoles} />);

        // The round number appears in the heading and the centre badge
        const threes = screen.getAllByText('3');
        expect(threes.length).toBeGreaterThanOrEqual(1);
    });

    it('shows heading with round number and section label', () => {
        render(<PlayerCircle players={players} roundNumber={2} roundRoles={roundRoles} />);

        expect(screen.getByText(/Round 2/i)).toBeInTheDocument();
        expect(screen.getByText(/Seating & Roles/i)).toBeInTheDocument();
    });

    it('shows no role badge for players without a role assignment', () => {
        const partialRoles = {
            round_number: 1,
            shuffler: { player_id: 1, display_name: 'Alice', seat_number: 1 },
            cutter: null,
            dealer: null,
            first_draw: null,
        };
        render(<PlayerCircle players={players} roundNumber={1} roundRoles={partialRoles} />);

        // Only Alice (player 1) is the Shuffler — exactly one badge
        expect(screen.getAllByText('Shuffler').length).toBe(1);
        // Cutter / Dealer / First Draw are unassigned — no badges for them
        expect(screen.queryByText('Cutter')).not.toBeInTheDocument();
        expect(screen.queryByText('Dealer')).not.toBeInTheDocument();
        expect(screen.queryByText('First Draw')).not.toBeInTheDocument();
    });

    it('filters out players without a seat number', () => {
        const mixedPlayers = [
            ...players,
            { id: 5, display_name: 'Eve', seat_number: null },
        ];
        render(<PlayerCircle players={mixedPlayers} roundNumber={1} roundRoles={roundRoles} />);

        expect(screen.queryByText('Eve')).not.toBeInTheDocument();
    });

    it('shows fallback message when no seated players are present', () => {
        render(
            <PlayerCircle
                players={[{ id: 1, display_name: 'Eve', seat_number: null }]}
                roundNumber={1}
                roundRoles={null}
            />,
        );

        expect(screen.getByText('No seated players')).toBeInTheDocument();
    });

    it('displays a dash when roundNumber is not provided', () => {
        render(<PlayerCircle players={[]} roundNumber={null} roundRoles={null} />);

        // The centre badge span renders exactly '—' when no round number is given
        expect(screen.getByText('—')).toBeInTheDocument();
    });

    it('renders without crashing when roundRoles is null', () => {
        render(<PlayerCircle players={players} roundNumber={1} roundRoles={null} />);

        expect(screen.getByText('Alice')).toBeInTheDocument();
        // No role badges when roundRoles is null
        expect(screen.queryByText('Shuffler')).not.toBeInTheDocument();
    });

    it('applies open animation class when isOpen is true', () => {
        const { container } = render(
            <PlayerCircle players={players} roundNumber={1} roundRoles={roundRoles} isOpen={true} />,
        );

        expect(container.firstChild).toHaveClass('animate-genie-open');
        expect(container.firstChild).not.toHaveClass('animate-genie-close');
    });

    it('applies close animation class when isOpen is false', () => {
        const { container } = render(
            <PlayerCircle players={players} roundNumber={1} roundRoles={roundRoles} isOpen={false} />,
        );

        expect(container.firstChild).toHaveClass('animate-genie-close');
        expect(container.firstChild).not.toHaveClass('animate-genie-open');
    });

    it('defaults to open animation when isOpen prop is omitted', () => {
        const { container } = render(
            <PlayerCircle players={players} roundNumber={1} roundRoles={roundRoles} />,
        );

        expect(container.firstChild).toHaveClass('animate-genie-open');
    });

    it('sets --genie-dx and --genie-dy when buttonRect is provided', () => {
        // JSDOM returns zeros from getBoundingClientRect(), so the offset from
        // a non-zero buttonRect to a zero-positioned wrapper will be the button
        // centre values themselves: (left + width/2) and (top + height/2).
        const buttonRect = { left: 100, top: 50, width: 24, height: 24 };
        const { container } = render(
            <PlayerCircle
                buttonRect={buttonRect}
                players={players}
                roundNumber={1}
                roundRoles={roundRoles}
            />,
        );

        const style = container.firstChild.style;
        expect(style.getPropertyValue('--genie-dx')).toBe('112px'); // 100 + 24/2 - 0
        expect(style.getPropertyValue('--genie-dy')).toBe('62px');  // 50 + 24/2 - 0
    });

    it('defaults genie CSS vars to 0px when buttonRect is omitted', () => {
        const { container } = render(
            <PlayerCircle players={players} roundNumber={1} roundRoles={roundRoles} />,
        );

        const style = container.firstChild.style;
        expect(style.getPropertyValue('--genie-dx')).toBe('0px');
        expect(style.getPropertyValue('--genie-dy')).toBe('0px');
    });
});
