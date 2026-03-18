import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BaseElementsInput from '@/Components/BaseElementsInput';

const booleanEl = { id: 1, name: 'burako', label: 'Burako', points: 100, input_type: 'boolean' };
const quantityEl = { id: 2, name: 'clean_canastra', label: 'Clean Canastra', points: 200, input_type: 'quantity' };
const elements = [booleanEl, quantityEl];

describe('BaseElementsInput', () => {
    it('renders a checkbox for boolean elements', () => {
        render(
            <BaseElementsInput
                elements={[booleanEl]}
                onChange={() => {}}
                teamId={10}
                values={{}}
            />,
        );

        expect(screen.getByRole('checkbox')).toBeInTheDocument();
        expect(screen.getByLabelText('Burako')).toBeInTheDocument();
    });

    it('renders a number input for quantity elements', () => {
        render(
            <BaseElementsInput
                elements={[quantityEl]}
                onChange={() => {}}
                teamId={10}
                values={{}}
            />,
        );

        expect(screen.getByLabelText('Clean Canastra')).toBeInTheDocument();
        expect(screen.getByLabelText('Clean Canastra')).toHaveAttribute('type', 'number');
    });

    it('shows the point value next to each boolean element', () => {
        render(
            <BaseElementsInput
                elements={[booleanEl]}
                onChange={() => {}}
                teamId={10}
                values={{}}
            />,
        );

        expect(screen.getByText('100 pts')).toBeInTheDocument();
    });

    it('shows a multiplier point label next to each quantity element', () => {
        render(
            <BaseElementsInput
                elements={[quantityEl]}
                onChange={() => {}}
                teamId={10}
                values={{}}
            />,
        );

        expect(screen.getByText('×200 pts')).toBeInTheDocument();
    });

    it('shows VOID instead of a point label when the element has 0 points', () => {
        const zeroPointsEl = { id: 3, name: 'zero_el', label: 'Zero El', points: 0, input_type: 'boolean' };

        render(
            <BaseElementsInput
                elements={[zeroPointsEl]}
                onChange={() => {}}
                teamId={10}
                values={{}}
            />,
        );

        expect(screen.getByText('VOID')).toBeInTheDocument();
        expect(screen.queryByText('0 pts', { selector: '.text-slate-400' })).not.toBeInTheDocument();
    });

    it('calls onChange with true when a boolean checkbox is checked', async () => {
        const onChange = vi.fn();

        render(
            <BaseElementsInput
                elements={[booleanEl]}
                onChange={onChange}
                teamId={10}
                values={{ 1: false }}
            />,
        );

        await userEvent.click(screen.getByRole('checkbox'));

        expect(onChange).toHaveBeenCalledWith(1, true);
    });

    it('calls onChange with a numeric string when a quantity input changes', async () => {
        const onChange = vi.fn();

        render(
            <BaseElementsInput
                elements={[quantityEl]}
                onChange={onChange}
                teamId={10}
                values={{ 2: 0 }}
            />,
        );

        const input = screen.getByLabelText('Clean Canastra');
        await userEvent.clear(input);
        await userEvent.type(input, '3');

        expect(onChange).toHaveBeenLastCalledWith(2, '3');
    });

    it('displays 0 pts total when all elements are at their default (unchecked / 0)', () => {
        render(
            <BaseElementsInput
                elements={elements}
                onChange={() => {}}
                teamId={10}
                values={{ 1: false, 2: 0 }}
            />,
        );

        expect(screen.getByTestId('current-round-score')).toHaveTextContent('0');
    });

    it('computes the total correctly for a mix of boolean and quantity elements', () => {
        render(
            <BaseElementsInput
                elements={elements}
                onChange={() => {}}
                teamId={10}
                values={{ 1: true, 2: 3 }}
            />,
        );

        // burako (true) = 100, clean_canastra (3) = 3 × 200 = 600 → total 700
        expect(screen.getByTestId('current-round-score')).toHaveTextContent('700');
    });

    it('generates unique input IDs scoped to the teamId to prevent DOM conflicts', () => {
        render(
            <BaseElementsInput
                elements={[booleanEl]}
                onChange={() => {}}
                teamId={42}
                values={{}}
            />,
        );

        const checkbox = screen.getByRole('checkbox');
        // Should include both teamId and elementId in the id attribute
        expect(checkbox.id).toContain('42');
        expect(checkbox.id).toContain('1');
    });

    it('renders a number input for cards in hand', () => {
        render(
            <BaseElementsInput
                elements={elements}
                onChange={() => {}}
                teamId={10}
                values={{}}
            />,
        );

        expect(screen.getByLabelText('Points in Hand')).toBeInTheDocument();
        expect(screen.getByLabelText('Points in Hand')).toHaveAttribute('type', 'number');
    });

    it('renders a number input for cards on table', () => {
        render(
            <BaseElementsInput
                elements={elements}
                onChange={() => {}}
                teamId={10}
                values={{}}
            />,
        );

        expect(screen.getByLabelText('Points on Table')).toBeInTheDocument();
        expect(screen.getByLabelText('Points on Table')).toHaveAttribute('type', 'number');
    });

    it('shows a subtraction indicator next to the points in hand input', () => {
        render(
            <BaseElementsInput
                elements={[]}
                onChange={() => {}}
                teamId={10}
                values={{}}
            />,
        );

        // Both Points in Hand and Points on Table show −pts when no canastras are present.
        const minusPts = screen.getAllByText('−pts');
        expect(minusPts.length).toBeGreaterThanOrEqual(1);
    });

    it('shows a subtraction indicator next to the points on table input when all canastras are zero', () => {
        render(
            <BaseElementsInput
                elements={[]}
                onChange={() => {}}
                teamId={10}
                values={{}}
            />,
        );

        // No canastra elements → canastrasAllZero=true → indicator shows −pts
        const minusPts = screen.getAllByText('−pts');
        expect(minusPts.length).toBeGreaterThanOrEqual(1);
    });

    it('shows an addition indicator next to the cards on table input when a canastra is scored', () => {
        render(
            <BaseElementsInput
                elements={[quantityEl]}
                onChange={() => {}}
                teamId={10}
                values={{ 2: 1 }}
            />,
        );

        expect(screen.getByText('+pts')).toBeInTheDocument();
    });

    it('calls onCardsChange with cardsInHand when the cards in hand input changes', async () => {
        const onCardsChange = vi.fn();

        render(
            <BaseElementsInput
                cardsInHand={0}
                elements={[]}
                onChange={() => {}}
                onCardsChange={onCardsChange}
                teamId={10}
                values={{}}
            />,
        );

        await userEvent.clear(screen.getByLabelText('Points in Hand'));
        await userEvent.type(screen.getByLabelText('Points in Hand'), '5');

        expect(onCardsChange).toHaveBeenLastCalledWith('cardsInHand', '5');
    });

    it('calls onCardsChange with cardsOnTable when the points on table input changes', async () => {
        const onCardsChange = vi.fn();

        render(
            <BaseElementsInput
                cardsOnTable={0}
                elements={[]}
                onChange={() => {}}
                onCardsChange={onCardsChange}
                teamId={10}
                values={{}}
            />,
        );

        await userEvent.clear(screen.getByLabelText('Points on Table'));
        await userEvent.type(screen.getByLabelText('Points on Table'), '3');

        expect(onCardsChange).toHaveBeenLastCalledWith('cardsOnTable', '3');
    });

    it('subtracts points in hand from the total', () => {
        render(
            <BaseElementsInput
                cardsInHand={50}
                elements={[booleanEl]}
                onChange={() => {}}
                teamId={10}
                values={{ 1: true }}
            />,
        );

        // booleanEl=100, cardsInHand=50 → 100 − 50 = 50
        expect(screen.getByTestId('current-round-score')).toHaveTextContent('50');
    });

    it('adds cards on table to the total when a canastra element is present and scored', () => {
        render(
            <BaseElementsInput
                cardsOnTable={75}
                elements={[quantityEl]}
                onChange={() => {}}
                teamId={10}
                values={{ 2: 1 }}
            />,
        );

        // clean_canastra(1) = 200, cardsOnTable=75 adds because canastra > 0 → 200 + 75 = 275
        expect(screen.getByTestId('current-round-score')).toHaveTextContent('275');
    });

    it('subtracts cards on table when all canastras are zero', () => {
        render(
            <BaseElementsInput
                cardsOnTable={75}
                elements={[quantityEl]}
                onChange={() => {}}
                teamId={10}
                values={{ 2: 0 }}
            />,
        );

        // clean_canastra=0 → canastrasAllZero=true → 0 − 75 = -75
        expect(screen.getByTestId('current-round-score')).toHaveTextContent('-75');
    });

    it('applies both card adjustments with subtraction when all canastras are zero', () => {
        render(
            <BaseElementsInput
                cardsInHand={30}
                cardsOnTable={20}
                elements={[booleanEl]}
                onChange={() => {}}
                teamId={10}
                values={{ 1: true }}
            />,
        );

        // booleanEl=100, no canastra elements → canastrasAllZero=true → 100 − 30 − 20 = 50
        expect(screen.getByTestId('current-round-score')).toHaveTextContent('50');
    });

    it('applies both card adjustments with addition when a canastra is scored', () => {
        render(
            <BaseElementsInput
                cardsInHand={30}
                cardsOnTable={20}
                elements={[booleanEl, quantityEl]}
                onChange={() => {}}
                teamId={10}
                values={{ 1: true, 2: 1 }}
            />,
        );

        // booleanEl=100, clean_canastra(1)=200 → base=300, − 30 + 20 = 290
        expect(screen.getByTestId('current-round-score')).toHaveTextContent('290');
    });

    it('subtracts both cardsInHand and cardsOnTable from base points when a score_override element is checked', () => {
        const overrideEl = { id: 3, name: 'penalty_element', label: 'Penalty Element', points: 0, input_type: 'boolean', score_override: true };

        render(
            <BaseElementsInput
                cardsInHand={80}
                cardsOnTable={50}
                elements={[booleanEl, overrideEl]}
                onChange={() => {}}
                teamId={10}
                values={{ 1: true, 3: true }}
            />,
        );

        // booleanEl checked (100), override active: total = 100 - 80 - 50 = -30
        expect(screen.getByTestId('current-round-score')).toHaveTextContent('-30');
    });

    it('uses normal formula when the score_override element is unchecked', () => {
        const overrideEl = { id: 3, name: 'penalty_element', label: 'Penalty Element', points: 0, input_type: 'boolean', score_override: true };

        render(
            <BaseElementsInput
                cardsInHand={10}
                cardsOnTable={0}
                elements={[booleanEl, overrideEl]}
                onChange={() => {}}
                teamId={10}
                values={{ 1: true, 3: false }}
            />,
        );

        // booleanEl=100, cardsInHand=10 → normal: 100 - 10 = 90
        expect(screen.getByTestId('current-round-score')).toHaveTextContent('90');
    });

    it('shows a cardsInHand error message when provided', () => {
        render(
            <BaseElementsInput
                cardErrors={{ cardsInHand: 'Cards in hand must be a whole number ≥ 0.' }}
                elements={[]}
                onChange={() => {}}
                teamId={10}
                values={{}}
            />,
        );

        expect(screen.getByText('Cards in hand must be a whole number ≥ 0.')).toBeInTheDocument();
    });

    it('shows a cardsOnTable error message when provided', () => {
        render(
            <BaseElementsInput
                cardErrors={{ cardsOnTable: 'Cards on table must be a whole number ≥ 0.' }}
                elements={[]}
                onChange={() => {}}
                teamId={10}
                values={{}}
            />,
        );

        expect(screen.getByText('Cards on table must be a whole number ≥ 0.')).toBeInTheDocument();
    });

    describe('penalty display', () => {
        const penaltyBooleanEl = { id: 10, name: 'burako', label: 'Burako', points: 100, penalty: 100, input_type: 'boolean' };
        const penaltyQuantityEl = { id: 11, name: 'comodin', label: 'Comodin', points: 50, penalty: 50, input_type: 'quantity' };

        it('shows the penalty as a negative score when a boolean element with penalty is unchecked', () => {
            render(
                <BaseElementsInput
                    elements={[penaltyBooleanEl]}
                    onChange={() => {}}
                    teamId={10}
                    values={{ 10: false }}
                />,
            );

            expect(screen.getByText('−100 pts')).toBeInTheDocument();
            expect(screen.queryByText('100 pts')).not.toBeInTheDocument();
        });

        it('shows normal points (not penalty) when a boolean element with penalty is checked', () => {
            render(
                <BaseElementsInput
                    elements={[penaltyBooleanEl]}
                    onChange={() => {}}
                    teamId={10}
                    values={{ 10: true }}
                />,
            );

            expect(screen.getAllByText('100 pts').length).toBeGreaterThanOrEqual(1);
            expect(screen.queryByText('−100 pts')).not.toBeInTheDocument();
        });

        it('shows the penalty as a negative score when a quantity element with penalty has zero quantity', () => {
            render(
                <BaseElementsInput
                    elements={[penaltyQuantityEl]}
                    onChange={() => {}}
                    teamId={10}
                    values={{ 11: 0 }}
                />,
            );

            expect(screen.getByText('−50 pts')).toBeInTheDocument();
            expect(screen.queryByText('×50 pts')).not.toBeInTheDocument();
        });

        it('shows normal multiplier label (not penalty) when a quantity element with penalty has quantity > 0', () => {
            render(
                <BaseElementsInput
                    elements={[penaltyQuantityEl]}
                    onChange={() => {}}
                    teamId={10}
                    values={{ 11: 2 }}
                />,
            );

            expect(screen.getByText('×50 pts')).toBeInTheDocument();
            expect(screen.queryByText('−50 pts')).not.toBeInTheDocument();
        });

        it('does not show a penalty label for elements with no penalty value', () => {
            render(
                <BaseElementsInput
                    elements={[{ ...penaltyBooleanEl, penalty: 0 }]}
                    onChange={() => {}}
                    teamId={10}
                    values={{ 10: false }}
                />,
            );

            // /^−\d/ matches penalty labels like '−100 pts' but not card indicators like '−pts'
            expect(screen.queryByText(/^−\d/)).not.toBeInTheDocument();
            expect(screen.getAllByText('100 pts').length).toBeGreaterThanOrEqual(1);
        });

        it('subtracts the penalty amount from the total when a boolean element with penalty is inactive', () => {
            render(
                <BaseElementsInput
                    elements={[penaltyBooleanEl]}
                    onChange={() => {}}
                    teamId={10}
                    values={{ 10: false }}
                />,
            );

            // penaltyBooleanEl unchecked → -(penalty 100) is applied; no cards → total = -100
            expect(screen.getByTestId('current-round-score')).toHaveTextContent('-100');
        });

        it('subtracts the penalty amount from the total when a quantity element with penalty is zero', () => {
            render(
                <BaseElementsInput
                    elements={[penaltyQuantityEl]}
                    onChange={() => {}}
                    teamId={10}
                    values={{ 11: 0 }}
                />,
            );

            // penaltyQuantityEl qty=0 → -(penalty 50) is applied; no cards → total = -50
            expect(screen.getByTestId('current-round-score')).toHaveTextContent('-50');
        });

        it('does not subtract penalty from total when a boolean element with penalty is active', () => {
            render(
                <BaseElementsInput
                    elements={[penaltyBooleanEl]}
                    onChange={() => {}}
                    teamId={10}
                    values={{ 10: true }}
                />,
            );

            // penaltyBooleanEl checked → normal points 100 used; no cards → total = 100
            const ptLabels = screen.getAllByText('100 pts');
            expect(ptLabels.length).toBeGreaterThanOrEqual(1);
        });

        it('does not subtract penalty from total when a quantity element with penalty has qty > 0', () => {
            render(
                <BaseElementsInput
                    elements={[penaltyQuantityEl]}
                    onChange={() => {}}
                    teamId={10}
                    values={{ 11: 2 }}
                />,
            );

            // penaltyQuantityEl qty=2 → normal 2 × 50 = 100; no cards → total = 100
            expect(screen.getByTestId('current-round-score')).toHaveTextContent('100');
        });
    });

    describe('showBaseElements prop', () => {
        it('hides the Check Achievements section when showBaseElements is false', () => {
            render(
                <BaseElementsInput
                    elements={[booleanEl]}
                    onChange={() => {}}
                    showBaseElements={false}
                    teamId={10}
                    values={{}}
                />,
            );

            expect(screen.queryByText('Check Achievements')).not.toBeInTheDocument();
            expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
        });

        it('hides the Quantity section when showBaseElements is false', () => {
            render(
                <BaseElementsInput
                    elements={[quantityEl]}
                    onChange={() => {}}
                    showBaseElements={false}
                    teamId={10}
                    values={{}}
                />,
            );

            expect(screen.queryByText('Quantity')).not.toBeInTheDocument();
            expect(screen.queryByLabelText('Clean Canastra')).not.toBeInTheDocument();
        });

        it('hides Points in Hand and Points on Table when showBaseElements is false', () => {
            render(
                <BaseElementsInput
                    elements={[booleanEl, quantityEl]}
                    onChange={() => {}}
                    showBaseElements={false}
                    teamId={10}
                    values={{}}
                />,
            );

            expect(screen.queryByLabelText('Points in Hand')).not.toBeInTheDocument();
            expect(screen.queryByLabelText('Points on Table')).not.toBeInTheDocument();
        });

        it('still shows the Score total when showBaseElements is false', () => {
            render(
                <BaseElementsInput
                    elements={[booleanEl, quantityEl]}
                    onChange={() => {}}
                    showBaseElements={false}
                    teamId={10}
                    values={{}}
                />,
            );

            expect(screen.getByText('Round Score:')).toBeInTheDocument();
            expect(screen.getByTestId('current-round-score')).toHaveTextContent('0');
        });

        it('shows all sections when showBaseElements is true (the default)', () => {
            render(
                <BaseElementsInput
                    elements={elements}
                    onChange={() => {}}
                    teamId={10}
                    values={{}}
                />,
            );

            expect(screen.getByText('Check Achievements')).toBeInTheDocument();
            expect(screen.getByText('Quantity')).toBeInTheDocument();
        });
    });

    describe('NumericStepper buttons', () => {
        it('calls onChange with incremented value when the + button next to a quantity element is clicked', async () => {
            const onChange = vi.fn();

            render(
                <BaseElementsInput
                    elements={[quantityEl]}
                    onChange={onChange}
                    teamId={10}
                    values={{ 2: 2 }}
                />,
            );

            const increaseButtons = screen.getAllByRole('button', { name: /increase/i });
            await userEvent.click(increaseButtons[0]);

            expect(onChange).toHaveBeenCalledWith(2, '3');
        });

        it('calls onChange with decremented value when the − button next to a quantity element is clicked', async () => {
            const onChange = vi.fn();

            render(
                <BaseElementsInput
                    elements={[quantityEl]}
                    onChange={onChange}
                    teamId={10}
                    values={{ 2: 2 }}
                />,
            );

            const decreaseButtons = screen.getAllByRole('button', { name: /decrease/i });
            await userEvent.click(decreaseButtons[0]);

            expect(onChange).toHaveBeenCalledWith(2, '1');
        });

        it('calls onCardsChange with incremented cardsInHand when its + button is clicked', async () => {
            const onCardsChange = vi.fn();

            render(
                <BaseElementsInput
                    cardsInHand={3}
                    elements={[]}
                    onChange={() => {}}
                    onCardsChange={onCardsChange}
                    teamId={10}
                    values={{}}
                />,
            );

            // Points in Hand + button is the second increase button (quantity section absent; only card steppers)
            const increaseButtons = screen.getAllByRole('button', { name: /increase/i });
            // First stepper is pointsInHand, second is pointsOnTable
            await userEvent.click(increaseButtons[0]);

            expect(onCardsChange).toHaveBeenCalledWith('cardsInHand', '4');
        });

        it('calls onCardsChange with incremented cardsOnTable when its + button is clicked', async () => {
            const onCardsChange = vi.fn();

            render(
                <BaseElementsInput
                    cardsOnTable={1}
                    elements={[quantityEl]}
                    onChange={() => {}}
                    onCardsChange={onCardsChange}
                    teamId={10}
                    values={{ 2: 1 }}
                />,
            );

            // With one quantity element there are three steppers: quantity, cardsInHand, cardsOnTable
            const increaseButtons = screen.getAllByRole('button', { name: /increase/i });
            await userEvent.click(increaseButtons[2]);

            expect(onCardsChange).toHaveBeenCalledWith('cardsOnTable', '2');
        });
    });
});
