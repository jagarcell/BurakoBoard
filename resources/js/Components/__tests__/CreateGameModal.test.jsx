import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import CreateGameModal from '@/Components/CreateGameModal';

const defaultForm = { name: 'Friday Burako', targetPoints: '2000' };

const renderModal = (overrides = {}) => {
    const props = {
        isOpen: true,
        onClose: vi.fn(),
        isRematch: false,
        form: defaultForm,
        errors: {},
        isSaving: false,
        onChange: vi.fn(),
        onSubmit: vi.fn(),
        ...overrides,
    };
    return { ...render(<CreateGameModal {...props} />), props };
};

describe('CreateGameModal', () => {
    it('does not render anything when isOpen is false', () => {
        renderModal({ isOpen: false });
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('renders "Create a new game" heading when isRematch is false', () => {
        renderModal();
        expect(screen.getByText('Create a new game')).toBeInTheDocument();
    });

    it('renders "Start a rematch" heading when isRematch is true', () => {
        renderModal({ isRematch: true });
        expect(screen.getByText('Start a rematch')).toBeInTheDocument();
    });

    it('shows the current form name value in the game name input', () => {
        renderModal();
        expect(screen.getByDisplayValue('Friday Burako')).toBeInTheDocument();
    });

    it('shows the current form targetPoints value in the winning score input', () => {
        renderModal();
        expect(screen.getByDisplayValue('2000')).toBeInTheDocument();
    });

    it('calls onChange with name field when the game name input changes', () => {
        const { props } = renderModal();
        fireEvent.change(screen.getByDisplayValue('Friday Burako'), {
            target: { value: 'Saturday Game' },
        });
        expect(props.onChange).toHaveBeenCalledWith('name', 'Saturday Game');
    });

    it('calls onChange with targetPoints field when the winning score input changes', () => {
        const { props } = renderModal();
        fireEvent.change(screen.getByDisplayValue('2000'), {
            target: { value: '3000' },
        });
        expect(props.onChange).toHaveBeenCalledWith('targetPoints', '3000');
    });

    it('calls onSubmit when the form is submitted', () => {
        const { props } = renderModal();
        fireEvent.submit(document.querySelector('form'));
        expect(props.onSubmit).toHaveBeenCalled();
    });

    it('shows field-level validation errors', () => {
        renderModal({
            errors: { name: 'A game name is required.', target_points: 'Winning score must be at least 1.' },
        });
        expect(screen.getByText('A game name is required.')).toBeInTheDocument();
        expect(screen.getByText('Winning score must be at least 1.')).toBeInTheDocument();
    });

    it('disables the save button while isSaving is true', () => {
        renderModal({ isSaving: true });
        expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled();
    });

    it('calls onClose when the Cancel button is clicked', () => {
        const { props } = renderModal();
        fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
        expect(props.onClose).toHaveBeenCalled();
    });

    it('renders "Start Rematch" as the submit button label when isRematch is true', () => {
        renderModal({ isRematch: true });
        expect(screen.getByRole('button', { name: /start rematch/i })).toBeInTheDocument();
    });

    it('renders "Accept" as the submit button label when isRematch is false and not saving', () => {
        renderModal({ isRematch: false, isSaving: false });
        expect(screen.getByRole('button', { name: /accept/i })).toBeInTheDocument();
    });
});
