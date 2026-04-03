import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CardPointsScanner from '@/Components/CardPointsScanner';

// ---------------------------------------------------------------------------
// Mock useCardPicker so tests never touch the real API
// ---------------------------------------------------------------------------

const mockAddCard    = vi.fn();
const mockRemoveCard = vi.fn();
const mockClear      = vi.fn();

let mockPickerState = {
    cardWeights: [],
    selected:    {},
    totalPoints: 0,
    loading:     true,
    error:       null,
};

vi.mock('@/hooks/useCardPicker', () => ({
    default: () => ({
        addCard:    mockAddCard,
        removeCard: mockRemoveCard,
        clear:      mockClear,
        ...mockPickerState,
    }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const sampleWeights = [
    { rank: 'joker', label: 'Joker',      points: 50, sort_order: 1 },
    { rank: '2',     label: 'Two (Wild)', points: 20, sort_order: 2 },
    { rank: 'A',     label: 'Ace',        points: 15, sort_order: 3 },
    { rank: 'K',     label: 'King',       points: 10, sort_order: 4 },
    { rank: 'Q',     label: 'Queen',      points: 10, sort_order: 5 },
];

function renderPicker(overrides = {}) {
    const onApply  = vi.fn();
    const onCancel = vi.fn();

    render(
        <CardPointsScanner
            label={overrides.label ?? 'Points in Hand'}
            onApply={overrides.onApply ?? onApply}
            onCancel={overrides.onCancel ?? onCancel}
        />,
    );

    return { onApply, onCancel };
}

beforeEach(() => {
    vi.clearAllMocks();
    mockPickerState = {
        cardWeights: [],
        selected:    {},
        totalPoints: 0,
        loading:     true,
        error:       null,
    };
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CardPointsScanner', () => {
    it('renders the header with the provided label', () => {
        renderPicker({ label: 'Points on Table' });
        expect(screen.getByText(/Pick Cards — Points on Table/i)).toBeInTheDocument();
    });

    it('shows "Loading cards…" while loading', () => {
        renderPicker();
        expect(screen.getByText(/Loading cards…/i)).toBeInTheDocument();
    });

    it('shows the error message when error is set', () => {
        mockPickerState = { ...mockPickerState, loading: false, error: 'Network error' };
        renderPicker();
        expect(screen.getByText('Network error')).toBeInTheDocument();
    });

    it('renders a rank tile for each card weight once loading is complete', () => {
        mockPickerState = { ...mockPickerState, loading: false, cardWeights: sampleWeights };
        renderPicker();
        expect(screen.getByLabelText('Add one Joker')).toBeInTheDocument();
        expect(screen.getByLabelText('Add one Ace')).toBeInTheDocument();
        expect(screen.getByLabelText('Add one King')).toBeInTheDocument();
    });

    it('calls addCard with the correct rank when + is tapped', () => {
        mockPickerState = { ...mockPickerState, loading: false, cardWeights: sampleWeights };
        renderPicker();
        fireEvent.click(screen.getByLabelText('Add one Ace'));
        expect(mockAddCard).toHaveBeenCalledWith('A');
    });

    it('calls removeCard with the correct rank when − is tapped', () => {
        mockPickerState = {
            ...mockPickerState,
            loading:     false,
            cardWeights: sampleWeights,
            selected:    { A: 2 },
            totalPoints: 30,
        };
        renderPicker();
        fireEvent.click(screen.getByLabelText('Remove one Ace'));
        expect(mockRemoveCard).toHaveBeenCalledWith('A');
    });

    it('disables the − button when count is 0', () => {
        mockPickerState = { ...mockPickerState, loading: false, cardWeights: sampleWeights };
        renderPicker();
        expect(screen.getByLabelText('Remove one Ace')).toBeDisabled();
    });

    it('enables the − button when count is greater than 0', () => {
        mockPickerState = {
            ...mockPickerState,
            loading:     false,
            cardWeights: sampleWeights,
            selected:    { A: 1 },
            totalPoints: 15,
        };
        renderPicker();
        expect(screen.getByLabelText('Remove one Ace')).not.toBeDisabled();
    });

    it('renders the count for a selected rank', () => {
        mockPickerState = {
            ...mockPickerState,
            loading:     false,
            cardWeights: sampleWeights,
            selected:    { A: 3 },
            totalPoints: 45,
        };
        renderPicker();
        expect(screen.getByLabelText('Ace count')).toHaveTextContent('3');
    });

    it('groups ranks by point tier with correct section headers', () => {
        mockPickerState = { ...mockPickerState, loading: false, cardWeights: sampleWeights };
        renderPicker();
        expect(screen.getByText(/50 pts each/i)).toBeInTheDocument();
        expect(screen.getByText(/20 pts each/i)).toBeInTheDocument();
        expect(screen.getByText(/15 pts each/i)).toBeInTheDocument();
        expect(screen.getByText(/10 pts each/i)).toBeInTheDocument();
    });

    it('displays the running total in the footer', () => {
        mockPickerState = { ...mockPickerState, totalPoints: 45 };
        renderPicker();
        expect(screen.getByTestId('picker-total')).toHaveTextContent('45 pts');
    });

    it('disables the Apply button when totalPoints is 0', () => {
        renderPicker();
        expect(screen.getByTestId('picker-apply')).toBeDisabled();
    });

    it('enables the Apply button when totalPoints > 0', () => {
        mockPickerState = { ...mockPickerState, totalPoints: 15 };
        renderPicker();
        expect(screen.getByTestId('picker-apply')).not.toBeDisabled();
    });

    it('calls onApply with totalPoints when Apply is clicked', () => {
        const onApply = vi.fn();
        mockPickerState = { ...mockPickerState, totalPoints: 25 };
        renderPicker({ onApply });
        fireEvent.click(screen.getByTestId('picker-apply'));
        expect(onApply).toHaveBeenCalledWith(25);
    });

    it('calls onCancel when the Cancel button is clicked', () => {
        const onCancel = vi.fn();
        renderPicker({ onCancel });
        fireEvent.click(screen.getByText('Cancel'));
        expect(onCancel).toHaveBeenCalledOnce();
    });

    it('calls onCancel when the ✕ header button is clicked', () => {
        const onCancel = vi.fn();
        renderPicker({ onCancel });
        fireEvent.click(screen.getByLabelText('Cancel picker'));
        expect(onCancel).toHaveBeenCalledOnce();
    });

    it('calls onCancel when the Escape key is pressed', async () => {
        const onCancel = vi.fn();
        renderPicker({ onCancel });
        fireEvent.keyDown(window, { key: 'Escape' });
        await waitFor(() => expect(onCancel).toHaveBeenCalledOnce());
    });

    it('shows the Clear button when totalPoints > 0', () => {
        mockPickerState = { ...mockPickerState, totalPoints: 10 };
        renderPicker();
        expect(screen.getByLabelText('Clear selection')).toBeInTheDocument();
    });

    it('hides the Clear button when totalPoints is 0', () => {
        renderPicker();
        expect(screen.queryByLabelText('Clear selection')).not.toBeInTheDocument();
    });

    it('calls clear when the Clear button is clicked', () => {
        mockPickerState = { ...mockPickerState, totalPoints: 10 };
        renderPicker();
        fireEvent.click(screen.getByLabelText('Clear selection'));
        expect(mockClear).toHaveBeenCalledOnce();
    });
});
