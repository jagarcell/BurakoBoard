import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ExtendGameModal from '@/Components/ExtendGameModal';

const defaultGame = {
    id: 1,
    name: 'Friday Burako',
    target_points: 2000,
    status: 'finished',
    user_role: 'creator',
};

const renderModal = (overrides = {}) => {
    const props = {
        isOpen: true,
        onClose: vi.fn(),
        game: defaultGame,
        targetPoints: '2500',
        errors: {},
        isExtending: false,
        onChange: vi.fn(),
        onSubmit: vi.fn(),
        ...overrides,
    };
    return { ...render(<ExtendGameModal {...props} />), props };
};

describe('ExtendGameModal', () => {
    it('does not render anything when isOpen is false', () => {
        renderModal({ isOpen: false });
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('renders the "Extend game" heading', () => {
        renderModal();
        expect(screen.getByText('Extend game')).toBeInTheDocument();
    });

    it('shows the current target_points as a hint in the description', () => {
        renderModal();
        expect(screen.getByText(/Current goal: 2000 pts/)).toBeInTheDocument();
    });

    it('shows the targetPoints value in the input', () => {
        renderModal();
        expect(screen.getByDisplayValue('2500')).toBeInTheDocument();
    });

    it('calls onChange when the input value changes', () => {
        const { props } = renderModal();
        fireEvent.change(screen.getByDisplayValue('2500'), {
            target: { value: '3500' },
        });
        expect(props.onChange).toHaveBeenCalledWith('3500');
    });

    it('calls onSubmit when the form is submitted', () => {
        const { props } = renderModal();
        fireEvent.submit(screen.getByRole('button', { name: /^extend$/i }).closest('form'));
        expect(props.onSubmit).toHaveBeenCalled();
    });

    it('calls onClose when the Cancel button is clicked', () => {
        const { props } = renderModal();
        fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
        expect(props.onClose).toHaveBeenCalled();
    });

    it('disables both buttons while isExtending is true', () => {
        renderModal({ isExtending: true });
        expect(screen.getByRole('button', { name: /extending/i })).toBeDisabled();
        expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled();
    });

    it('shows the submit button label as "Extend" when not extending', () => {
        renderModal({ isExtending: false });
        expect(screen.getByRole('button', { name: /^extend$/i })).toBeInTheDocument();
    });

    it('shows the submit button label as "Extending…" when isExtending is true', () => {
        renderModal({ isExtending: true });
        expect(screen.getByRole('button', { name: /extending/i })).toBeInTheDocument();
    });

    it('displays a target_points field error', () => {
        renderModal({ errors: { target_points: 'Must exceed leading score.' } });
        expect(screen.getByText('Must exceed leading score.')).toBeInTheDocument();
    });

    it('displays a general error', () => {
        renderModal({ errors: { general: 'Unable to extend the game right now.' } });
        expect(screen.getByText('Unable to extend the game right now.')).toBeInTheDocument();
    });

    it('does not show a hint when game prop is null', () => {
        renderModal({ game: null });
        expect(screen.queryByText(/Current goal:/)).not.toBeInTheDocument();
    });
});
