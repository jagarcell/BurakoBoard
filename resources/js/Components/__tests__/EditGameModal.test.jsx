import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import EditGameModal from '@/Components/EditGameModal';

const defaultGame = {
    id: 1,
    name: 'Friday Burako',
    target_points: 2000,
    user_role: 'creator',
    current_round_number: 0,
};

const defaultForm = { name: 'Friday Burako', targetPoints: '2000' };

const renderModal = (overrides = {}) => {
    const props = {
        isOpen: true,
        onClose: vi.fn(),
        game: defaultGame,
        form: defaultForm,
        errors: {},
        isSaving: false,
        isDeleting: false,
        onChange: vi.fn(),
        onSubmit: vi.fn(),
        onDelete: vi.fn(),
        ...overrides,
    };
    return { ...render(<EditGameModal {...props} />), props };
};

describe('EditGameModal', () => {
    it('does not render anything when isOpen is false', () => {
        renderModal({ isOpen: false });
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('renders the "Edit game" heading', () => {
        renderModal();
        expect(screen.getByText('Edit game')).toBeInTheDocument();
    });

    it('shows the current game name in the input', () => {
        renderModal();
        expect(screen.getByDisplayValue('Friday Burako')).toBeInTheDocument();
    });

    it('shows the current target points in the input', () => {
        renderModal();
        expect(screen.getByDisplayValue('2000')).toBeInTheDocument();
    });

    it('calls onChange with name field when the game name input changes', () => {
        const { props } = renderModal();
        fireEvent.change(screen.getByDisplayValue('Friday Burako'), {
            target: { value: 'Saturday Tournament' },
        });
        expect(props.onChange).toHaveBeenCalledWith('name', 'Saturday Tournament');
    });

    it('calls onChange with targetPoints field when the winning score input changes', () => {
        const { props } = renderModal();
        fireEvent.change(screen.getByDisplayValue('2000'), {
            target: { value: '5000' },
        });
        expect(props.onChange).toHaveBeenCalledWith('targetPoints', '5000');
    });

    it('shows the Delete button when user_role is creator and current_round_number is 0', () => {
        renderModal({
            game: { ...defaultGame, user_role: 'creator', current_round_number: 0 },
        });
        expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
    });

    it('does not show the Delete button when current_round_number is > 0', () => {
        renderModal({
            game: { ...defaultGame, user_role: 'creator', current_round_number: 1 },
        });
        expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
    });

    it('does not show the Delete button when user_role is not creator', () => {
        renderModal({
            game: { ...defaultGame, user_role: 'player', current_round_number: 0 },
        });
        expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
    });

    it('calls onDelete when the Delete button is clicked', () => {
        const { props } = renderModal({
            game: { ...defaultGame, user_role: 'creator', current_round_number: 0 },
        });
        fireEvent.click(screen.getByRole('button', { name: /delete/i }));
        expect(props.onDelete).toHaveBeenCalled();
    });

    it('shows field-level validation errors', () => {
        renderModal({
            errors: { name: 'Name cannot be blank.', target_points: 'Must be at least 1.' },
        });
        expect(screen.getByText('Name cannot be blank.')).toBeInTheDocument();
        expect(screen.getByText('Must be at least 1.')).toBeInTheDocument();
    });

    it('disables all buttons while isSaving is true', () => {
        renderModal({ isSaving: true });
        expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
        expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled();
    });

    it('disables all buttons while isDeleting is true', () => {
        renderModal({
            isDeleting: true,
            game: { ...defaultGame, user_role: 'creator', current_round_number: 0 },
        });
        screen.getAllByRole('button').forEach((btn) => {
            expect(btn).toBeDisabled();
        });
    });

    it('calls onClose when the Cancel button is clicked', () => {
        const { props } = renderModal();
        fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
        expect(props.onClose).toHaveBeenCalled();
    });

    it('calls onSubmit when the form is submitted via the Save button', () => {
        const { props } = renderModal();
        fireEvent.submit(document.querySelector('form'));
        expect(props.onSubmit).toHaveBeenCalled();
    });
});
