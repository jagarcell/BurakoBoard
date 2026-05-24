import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import RandomTeamsModal from '@/Components/RandomTeamsModal';

describe('RandomTeamsModal', () => {
    const baseProps = {
        isOpen: true,
        isCreating: false,
        playerNames: ['', '', '', '', '', ''],
        duplicateIndexes: [],
        error: '',
        onClose: vi.fn(),
        onCreate: vi.fn(),
        onPlayerNameChange: vi.fn(),
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('does not render when closed', () => {
        render(<RandomTeamsModal {...baseProps} isOpen={false} />);

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('renders six player inputs when open', () => {
        render(<RandomTeamsModal {...baseProps} />);

        expect(screen.getByLabelText('Player 1')).toBeInTheDocument();
        expect(screen.getByLabelText('Player 6')).toBeInTheDocument();
    });

    it('forwards input changes', () => {
        render(<RandomTeamsModal {...baseProps} />);

        fireEvent.change(screen.getByLabelText('Player 2'), { target: { value: 'Bob' } });

        expect(baseProps.onPlayerNameChange).toHaveBeenCalledWith(1, 'Bob');
    });

    it('calls onCreate when Create is clicked', () => {
        render(<RandomTeamsModal {...baseProps} />);

        fireEvent.click(screen.getByRole('button', { name: /^create$/i }));

        expect(baseProps.onCreate).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when Cancel is clicked', () => {
        render(<RandomTeamsModal {...baseProps} />);

        fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

        expect(baseProps.onClose).toHaveBeenCalledTimes(1);
    });

    it('shows API errors', () => {
        render(
            <RandomTeamsModal
                {...baseProps}
                error="Exactly 4 or 6 players are required to create random teams."
            />,
        );

        expect(screen.getByText('Exactly 4 or 6 players are required to create random teams.')).toBeInTheDocument();
    });

    it('highlights duplicated player inputs', () => {
        render(
            <RandomTeamsModal
                {...baseProps}
                duplicateIndexes={[0, 2]}
                playerNames={['Ana', '', 'ana', '', '', '']}
            />,
        );

        expect(screen.getByLabelText('Player 1')).toHaveClass('border-rose-500');
        expect(screen.getByLabelText('Player 3')).toHaveClass('border-rose-500');
        expect(screen.getByLabelText('Player 2')).not.toHaveClass('border-rose-500');
    });
});
