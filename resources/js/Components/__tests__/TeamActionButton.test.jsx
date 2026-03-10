import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TeamActionButton from '@/Components/TeamActionButton';

describe('TeamActionButton', () => {
    it('renders children as button text', () => {
        render(<TeamActionButton type="button">Create team</TeamActionButton>);
        expect(screen.getByRole('button', { name: 'Create team' })).toBeInTheDocument();
    });

    it('calls onClick when clicked', async () => {
        const handleClick = vi.fn();
        render(<TeamActionButton onClick={handleClick} type="button">Add team</TeamActionButton>);
        await userEvent.click(screen.getByRole('button', { name: 'Add team' }));
        expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('is disabled when disabled prop is true', () => {
        render(<TeamActionButton disabled type="button">Edit team</TeamActionButton>);
        expect(screen.getByRole('button', { name: 'Edit team' })).toBeDisabled();
    });
});
