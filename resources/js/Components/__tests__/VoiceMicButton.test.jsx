import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import VoiceMicButton from '@/Components/VoiceMicButton';

describe('VoiceMicButton', () => {
    it('renders nothing when isSupported is false', () => {
        const { container } = render(
            <VoiceMicButton isSupported={false} isListening={false} onToggle={vi.fn()} feedback={null} />,
        );

        expect(container.firstChild).toBeNull();
    });

    it('renders the mic button when isSupported is true', () => {
        render(
            <VoiceMicButton isSupported={true} isListening={false} onToggle={vi.fn()} feedback={null} />,
        );

        expect(screen.getByRole('button', { name: /start voice command/i })).toBeInTheDocument();
    });

    it('sets aria-label to "Stop voice command" when listening', () => {
        render(
            <VoiceMicButton isSupported={true} isListening={true} onToggle={vi.fn()} feedback={null} />,
        );

        expect(screen.getByRole('button', { name: /stop voice command/i })).toBeInTheDocument();
    });

    it('sets aria-pressed to true when listening', () => {
        render(
            <VoiceMicButton isSupported={true} isListening={true} onToggle={vi.fn()} feedback={null} />,
        );

        expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
    });

    it('sets aria-pressed to false when not listening', () => {
        render(
            <VoiceMicButton isSupported={true} isListening={false} onToggle={vi.fn()} feedback={null} />,
        );

        expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'false');
    });

    it('calls onToggle when the button is clicked', () => {
        const onToggle = vi.fn();
        render(
            <VoiceMicButton isSupported={true} isListening={false} onToggle={onToggle} feedback={null} />,
        );

        fireEvent.click(screen.getByRole('button'));

        expect(onToggle).toHaveBeenCalledTimes(1);
    });

    it('applies light-green classes when listening and not yet ready', () => {
        render(
            <VoiceMicButton isSupported={true} isListening={true} isReady={false} onToggle={vi.fn()} feedback={null} />,
        );

        const btn = screen.getByRole('button');
        expect(btn).toHaveClass('bg-green-100', 'text-green-600');
    });

    it('applies light-green classes when listening and ready', () => {
        render(
            <VoiceMicButton isSupported={true} isListening={true} isReady={true} onToggle={vi.fn()} feedback={null} />,
        );

        const btn = screen.getByRole('button');
        expect(btn).toHaveClass('bg-green-100', 'text-green-600');
    });

    it('does not apply light-green classes when not listening', () => {
        render(
            <VoiceMicButton isSupported={true} isListening={false} onToggle={vi.fn()} feedback={null} />,
        );

        expect(screen.getByRole('button')).not.toHaveClass('bg-green-100');
    });

    it('does not apply animate-pulse when not listening', () => {
        render(
            <VoiceMicButton isSupported={true} isListening={false} onToggle={vi.fn()} feedback={null} />,
        );

        expect(screen.getByRole('button')).not.toHaveClass('animate-pulse');
    });

    it('does not apply animate-pulse when listening', () => {
        render(
            <VoiceMicButton isSupported={true} isListening={true} isReady={true} onToggle={vi.fn()} feedback={null} />,
        );

        expect(screen.getByRole('button')).not.toHaveClass('animate-pulse');
    });

    it('renders a success feedback message in green', () => {
        render(
            <VoiceMicButton
                isSupported={true}
                isListening={false}
                onToggle={vi.fn()}
                feedback={{ ok: true, message: '✓ Add Dirty Canastra to The Cracks', transcript: 'Add Dirty Canastra to The Cracks' }}
            />,
        );

        const msg = screen.getByText('Add Dirty Canastra to The Cracks - Done!');
        expect(msg).toHaveClass('text-green-600');
        expect(msg).toHaveAttribute('title', '✓ Add Dirty Canastra to The Cracks');
    });

    it('renders a success feedback without transcript showing only Done!', () => {
        render(
            <VoiceMicButton
                isSupported={true}
                isListening={false}
                onToggle={vi.fn()}
                feedback={{ ok: true, message: 'Saving round…' }}
            />,
        );

        const msg = screen.getByText('Done!');
        expect(msg).toHaveClass('text-green-600');
    });

    it('renders an error feedback message in red', () => {
        render(
            <VoiceMicButton
                isSupported={true}
                isListening={false}
                onToggle={vi.fn()}
                feedback={{ ok: false, message: 'Element not recognised.', transcript: 'mumbo jumbo' }}
            />,
        );

        const msg = screen.getByText('mumbo jumbo - Failed!');
        expect(msg).toHaveClass('text-red-500');
        expect(msg).toHaveAttribute('title', 'Element not recognised.');
    });

    it('renders an error feedback without transcript showing only Failed!', () => {
        render(
            <VoiceMicButton
                isSupported={true}
                isListening={false}
                onToggle={vi.fn()}
                feedback={{ ok: false, message: 'No speech detected — try again.' }}
            />,
        );

        const msg = screen.getByText('Failed!');
        expect(msg).toHaveClass('text-red-500');
    });

    it('renders no feedback span when feedback prop is null', () => {
        const { container } = render(
            <VoiceMicButton isSupported={true} isListening={false} onToggle={vi.fn()} feedback={null} />,
        );

        expect(container.querySelector('span')).toBeNull();
    });

    it('renders an SVG microphone icon inside the button', () => {
        const { container } = render(
            <VoiceMicButton isSupported={true} isListening={false} onToggle={vi.fn()} feedback={null} />,
        );

        const svg = container.querySelector('svg');
        expect(svg).toBeInTheDocument();
        expect(svg).toHaveAttribute('aria-hidden', 'true');
    });

    it('meets minimum 44×44px touch-target dimensions', () => {
        render(
            <VoiceMicButton isSupported={true} isListening={false} onToggle={vi.fn()} feedback={null} />,
        );

        // h-11 w-11 = 2.75rem = 44px by default Tailwind scale.
        const btn = screen.getByRole('button');
        expect(btn).toHaveClass('h-11', 'w-11');
    });

    describe('voice wave indicator', () => {
        it('renders the wave indicator when isSpeaking is true', () => {
            const { getByTestId } = render(
                <VoiceMicButton isSupported={true} isListening={true} isSpeaking={true} onToggle={vi.fn()} feedback={null} />,
            );

            expect(getByTestId('voice-wave-indicator')).toBeInTheDocument();
        });

        it('does not render the wave indicator when isSpeaking is false', () => {
            const { queryByTestId } = render(
                <VoiceMicButton isSupported={true} isListening={false} isSpeaking={false} onToggle={vi.fn()} feedback={null} />,
            );

            expect(queryByTestId('voice-wave-indicator')).toBeNull();
        });

        it('does not render the wave indicator when listening but isSpeaking is false', () => {
            const { queryByTestId } = render(
                <VoiceMicButton isSupported={true} isListening={true} isSpeaking={false} onToggle={vi.fn()} feedback={null} />,
            );

            expect(queryByTestId('voice-wave-indicator')).toBeNull();
        });

        it('renders exactly three animated rings inside the wave indicator', () => {
            const { getByTestId } = render(
                <VoiceMicButton isSupported={true} isListening={true} isSpeaking={true} onToggle={vi.fn()} feedback={null} />,
            );

            const rings = getByTestId('voice-wave-indicator').querySelectorAll('.animate-ripple');
            expect(rings).toHaveLength(3);
        });

        it('applies staggered animationDelay styles to the ripple rings', () => {
            const { getByTestId } = render(
                <VoiceMicButton isSupported={true} isListening={true} isSpeaking={true} onToggle={vi.fn()} feedback={null} />,
            );

            const rings = Array.from(
                getByTestId('voice-wave-indicator').querySelectorAll('.animate-ripple'),
            );
            const delays = rings.map((r) => r.style.animationDelay);
            expect(delays).toEqual(['0ms', '467ms', '933ms']);
        });

        it('hides the wave indicator from the accessibility tree', () => {
            const { getByTestId } = render(
                <VoiceMicButton isSupported={true} isListening={true} isSpeaking={true} onToggle={vi.fn()} feedback={null} />,
            );

            expect(getByTestId('voice-wave-indicator')).toHaveAttribute('aria-hidden', 'true');
        });

        it('does not render wave indicator when isSupported is false', () => {
            const { queryByTestId } = render(
                <VoiceMicButton isSupported={false} isListening={true} isSpeaking={true} onToggle={vi.fn()} feedback={null} />,
            );

            expect(queryByTestId('voice-wave-indicator')).toBeNull();
        });
    });
});
