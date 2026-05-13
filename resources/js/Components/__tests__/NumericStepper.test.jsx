import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NumericStepper from '@/Components/NumericStepper';

describe('NumericStepper', () => {
    it('renders an input of type number', () => {
        render(<NumericStepper id="test-input" onChange={() => {}} value={0} />);

        expect(screen.getByRole('spinbutton')).toBeInTheDocument();
        expect(screen.getByRole('spinbutton')).toHaveAttribute('type', 'number');
    });

    it('associates the input with the provided id', () => {
        render(<NumericStepper id="my-stepper" onChange={() => {}} value={0} />);

        expect(document.getElementById('my-stepper')).toBeInTheDocument();
        expect(document.getElementById('my-stepper')).toHaveAttribute('type', 'number');
    });

    it('renders a decrease (−) button and an increase (+) button', () => {
        render(<NumericStepper id="test-input" onChange={() => {}} value={3} />);

        expect(screen.getByRole('button', { name: /decrease/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /increase/i })).toBeInTheDocument();
    });

    it('calls onChange with the decremented value string when the − button is clicked', async () => {
        const onChange = vi.fn();

        render(<NumericStepper id="test-input" onChange={onChange} value={5} />);

        await userEvent.click(screen.getByRole('button', { name: /decrease/i }));

        expect(onChange).toHaveBeenCalledWith('4');
    });

    it('calls onChange with the incremented value string when the + button is clicked', async () => {
        const onChange = vi.fn();

        render(<NumericStepper id="test-input" onChange={onChange} value={5} />);

        await userEvent.click(screen.getByRole('button', { name: /increase/i }));

        expect(onChange).toHaveBeenCalledWith('6');
    });

    it('clamps decrement at the min value (default 0)', async () => {
        const onChange = vi.fn();

        render(<NumericStepper id="test-input" onChange={onChange} value={0} />);

        await userEvent.click(screen.getByRole('button', { name: /decrease/i }));

        expect(onChange).not.toHaveBeenCalled();
    });

    it('disables the decrease button when the value equals min', () => {
        render(<NumericStepper id="test-input" onChange={() => {}} value={0} />);

        expect(screen.getByRole('button', { name: /decrease/i })).toBeDisabled();
    });

    it('enables the decrease button when the value is above min', () => {
        render(<NumericStepper id="test-input" onChange={() => {}} value={1} />);

        expect(screen.getByRole('button', { name: /decrease/i })).toBeEnabled();
    });

    it('respects a custom min prop for clamping', async () => {
        const onChange = vi.fn();

        render(<NumericStepper id="test-input" min={2} onChange={onChange} value={2} />);

        await userEvent.click(screen.getByRole('button', { name: /decrease/i }));

        expect(onChange).not.toHaveBeenCalled();
    });

    it('respects a custom step prop when decrementing', async () => {
        const onChange = vi.fn();

        render(<NumericStepper id="test-input" onChange={onChange} step={5} value={10} />);

        await userEvent.click(screen.getByRole('button', { name: /decrease/i }));

        expect(onChange).toHaveBeenCalledWith('5');
    });

    it('respects a custom step prop when incrementing', async () => {
        const onChange = vi.fn();

        render(<NumericStepper id="test-input" onChange={onChange} step={5} value={10} />);

        await userEvent.click(screen.getByRole('button', { name: /increase/i }));

        expect(onChange).toHaveBeenCalledWith('15');
    });

    it('disables both buttons and the input when disabled is true', () => {
        render(<NumericStepper disabled id="test-input" onChange={() => {}} value={3} />);

        expect(screen.getByRole('button', { name: /decrease/i })).toBeDisabled();
        expect(screen.getByRole('button', { name: /increase/i })).toBeDisabled();
        expect(screen.getByRole('spinbutton')).toBeDisabled();
    });

    it('does not call onChange when the − button is clicked while disabled', async () => {
        const onChange = vi.fn();

        render(<NumericStepper disabled id="test-input" onChange={onChange} value={5} />);

        await userEvent.click(screen.getByRole('button', { name: /decrease/i }));

        expect(onChange).not.toHaveBeenCalled();
    });

    it('does not call onChange when the + button is clicked while disabled', async () => {
        const onChange = vi.fn();

        render(<NumericStepper disabled id="test-input" onChange={onChange} value={5} />);

        await userEvent.click(screen.getByRole('button', { name: /increase/i }));

        expect(onChange).not.toHaveBeenCalled();
    });

    it('calls onChange with the typed value when the input is changed directly', async () => {
        const onChange = vi.fn();

        render(<NumericStepper id="test-input" onChange={onChange} value={0} />);

        await userEvent.clear(screen.getByRole('spinbutton'));
        await userEvent.type(screen.getByRole('spinbutton'), '7');

        expect(onChange).toHaveBeenLastCalledWith('7');
    });

    describe('readOnly mode', () => {
        it('hides the decrease and increase buttons when readOnly is true', () => {
            render(<NumericStepper id="test-input" onChange={() => {}} readOnly value={3} />);

            expect(screen.queryByRole('button', { name: /decrease/i })).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: /increase/i })).not.toBeInTheDocument();
        });

        it('still renders the input with the correct value when readOnly is true', () => {
            render(<NumericStepper id="test-input" onChange={() => {}} readOnly value={7} />);

            expect(screen.getByRole('spinbutton')).toBeInTheDocument();
            expect(screen.getByRole('spinbutton')).toHaveValue(7);
        });

        it('does not call onChange when the input is changed while readOnly', async () => {
            const onChange = vi.fn();

            render(<NumericStepper id="test-input" onChange={onChange} readOnly value={3} />);

            // readOnly input ignores user typing
            await userEvent.type(screen.getByRole('spinbutton'), '9');

            expect(onChange).not.toHaveBeenCalled();
        });
    });

    describe('mobile touch-edit mode', () => {
        it('clears the field when tapped and current value is 0', () => {
            render(<NumericStepper id="test-input" onChange={() => {}} value={0} />);

            const input = screen.getByRole('spinbutton');
            fireEvent.touchStart(input);
            fireEvent.focus(input);

            // type switches to 'text' in edit mode; empty text input has value ''
            expect(input).toHaveValue('');
        });

        it('keeps the current value when tapped and value is non-zero', () => {
            render(<NumericStepper id="test-input" onChange={() => {}} value={5} />);

            const input = screen.getByRole('spinbutton');
            fireEvent.touchStart(input);
            fireEvent.focus(input);

            // type switches to 'text' in edit mode; value is the string representation
            expect(input).toHaveValue('5');
        });

        it('does not enter edit mode when focused without a preceding touch', () => {
            render(<NumericStepper id="test-input" onChange={() => {}} value={0} />);

            const input = screen.getByRole('spinbutton');
            // plain focus, no touchStart — should keep original value
            fireEvent.focus(input);

            expect(input).toHaveValue(0);
        });

        it('commits the min value via onChange when blurred with an empty field', () => {
            const onChange = vi.fn();

            render(<NumericStepper id="test-input" min={0} onChange={onChange} value={0} />);

            const input = screen.getByRole('spinbutton');
            fireEvent.touchStart(input);
            fireEvent.focus(input); // clears to ''
            fireEvent.blur(input);

            expect(onChange).toHaveBeenCalledWith('0');
        });

        it('commits the typed value via onChange when blurred after typing', () => {
            const onChange = vi.fn();

            render(<NumericStepper id="test-input" onChange={onChange} value={0} />);

            const input = screen.getByRole('spinbutton');
            fireEvent.touchStart(input);
            fireEvent.focus(input); // clears to ''
            fireEvent.change(input, { target: { value: '7' } });
            fireEvent.blur(input);

            expect(onChange).toHaveBeenLastCalledWith('7');
        });

        it('does not enter edit mode when disabled', () => {
            render(<NumericStepper disabled id="test-input" onChange={() => {}} value={0} />);

            const input = screen.getByRole('spinbutton');
            fireEvent.touchStart(input);
            fireEvent.focus(input);

            // disabled — touchRef should not have been set
            expect(input).toHaveValue(0);
        });

        it('does not enter edit mode when readOnly', () => {
            render(<NumericStepper id="test-input" onChange={() => {}} readOnly value={3} />);

            const input = screen.getByRole('spinbutton');
            fireEvent.touchStart(input);
            fireEvent.focus(input);

            expect(input).toHaveValue(3);
        });
    });
});
