import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import TeamScoreBadge from '@/Components/TeamScoreBadge';

describe('TeamScoreBadge', () => {
    it('renders the score value', () => {
        render(<TeamScoreBadge score={42} label="Team Alpha score" />);
        expect(screen.getByText('42')).toBeInTheDocument();
    });

    it('applies a red badge for a negative score', () => {
        render(<TeamScoreBadge score={-10} label="negative score" />);
        const badge = screen.getByLabelText('negative score');
        expect(badge).toHaveClass('bg-red-100', 'text-red-800');
    });

    it('applies a bisque/green badge for a score of zero', () => {
        render(<TeamScoreBadge score={0} label="zero score" />);
        const badge = screen.getByLabelText('zero score');
        expect(badge).toHaveClass('bg-[bisque]', 'text-green-700');
    });

    it('applies a green badge for a positive score when bothPositive is false', () => {
        render(<TeamScoreBadge score={100} label="positive score" />);
        const badge = screen.getByLabelText('positive score');
        expect(badge).toHaveClass('bg-green-100', 'text-green-800');
    });

    it('applies a yellow badge when bothPositive is true and this score is lower', () => {
        render(
            <TeamScoreBadge
                score={50}
                label="losing positive"
                bothPositive
                opponentScore={100}
            />,
        );
        const badge = screen.getByLabelText('losing positive');
        expect(badge).toHaveClass('bg-yellow-100', 'text-yellow-800');
    });

    it('applies a green badge when bothPositive is true and this score is higher', () => {
        render(
            <TeamScoreBadge
                score={100}
                label="winning positive"
                bothPositive
                opponentScore={50}
            />,
        );
        const badge = screen.getByLabelText('winning positive');
        expect(badge).toHaveClass('bg-green-100', 'text-green-800');
    });

    it('applies a green badge when bothPositive is true and scores are equal', () => {
        render(
            <TeamScoreBadge
                score={100}
                label="tied positive"
                bothPositive
                opponentScore={100}
            />,
        );
        const badge = screen.getByLabelText('tied positive');
        expect(badge).toHaveClass('bg-green-100', 'text-green-800');
    });

    it('applies a green badge when bothPositive is false even if opponentScore is higher', () => {
        render(
            <TeamScoreBadge
                score={50}
                label="not both positive"
                bothPositive={false}
                opponentScore={200}
            />,
        );
        const badge = screen.getByLabelText('not both positive');
        expect(badge).toHaveClass('bg-green-100', 'text-green-800');
    });

    it('uses the provided aria-label', () => {
        render(<TeamScoreBadge score={5} label="My special label" />);
        expect(screen.getByLabelText('My special label')).toBeInTheDocument();
    });
});
