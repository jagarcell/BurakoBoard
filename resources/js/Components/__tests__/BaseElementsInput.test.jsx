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

        expect(screen.getByRole('spinbutton')).toBeInTheDocument();
        expect(screen.getByLabelText('Clean Canastra')).toBeInTheDocument();
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

        await userEvent.clear(screen.getByRole('spinbutton'));
        await userEvent.type(screen.getByRole('spinbutton'), '3');

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

        expect(screen.getByText('0 pts')).toBeInTheDocument();
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
        expect(screen.getByText('700 pts')).toBeInTheDocument();
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
});
