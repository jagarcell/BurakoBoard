import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import CardSpinner from '@/Components/CardSpinner';

describe('CardSpinner', () => {
    it('renders a status region for screen readers', () => {
        render(<CardSpinner />);
        expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('has aria-label matching the message', () => {
        render(<CardSpinner message="Recording…" />);
        expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Recording…');
    });

    it('uses aria-live="polite" on the status wrapper', () => {
        render(<CardSpinner />);
        expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    });

    it('renders an SVG element marked aria-hidden', () => {
        const { container } = render(<CardSpinner />);
        const svg = container.querySelector('svg');
        expect(svg).toBeInTheDocument();
        expect(svg).toHaveAttribute('aria-hidden', 'true');
    });

    it('renders five playing-card groups inside the orbiting group', () => {
        const { container } = render(<CardSpinner />);
        // The inner <g> contains 5 card <g> elements
        const orbitGroup = container.querySelector('svg > g');
        const cardGroups = orbitGroup.querySelectorAll(':scope > g');
        expect(cardGroups).toHaveLength(5);
    });

    it('renders all four suit symbols', () => {
        const { container } = render(<CardSpinner />);
        const markup = container.innerHTML;
        expect(markup).toContain('♠');
        expect(markup).toContain('♥');
        expect(markup).toContain('♣');
        expect(markup).toContain('♦');
    });

    it('renders black suits in dark colour', () => {
        const { container } = render(<CardSpinner />);
        const darkTexts = container.querySelectorAll('text[fill="#111827"]');
        expect(darkTexts.length).toBeGreaterThan(0);
    });

    it('renders red suits in red colour', () => {
        const { container } = render(<CardSpinner />);
        const redTexts = container.querySelectorAll('text[fill="#DC2626"]');
        expect(redTexts.length).toBeGreaterThan(0);
    });

    it('shows the default "Recording…" message', () => {
        render(<CardSpinner />);
        expect(screen.getByText('Recording…')).toBeInTheDocument();
    });

    it('shows a custom message when provided', () => {
        render(<CardSpinner message="Saving data…" />);
        expect(screen.getByText('Saving data…')).toBeInTheDocument();
    });

    it('hides the message paragraph when message is empty string', () => {
        const { container } = render(<CardSpinner message="" />);
        expect(container.querySelector('p')).not.toBeInTheDocument();
    });

    it('hides the message paragraph when message is null', () => {
        const { container } = render(<CardSpinner message={null} />);
        expect(container.querySelector('p')).not.toBeInTheDocument();
    });

    it('applies extra className to the wrapper div', () => {
        const { container } = render(<CardSpinner className="my-custom-class" />);
        expect(container.firstChild).toHaveClass('my-custom-class');
    });

    it('applies the animate-card-orbit class to the orbiting group', () => {
        const { container } = render(<CardSpinner />);
        const orbitGroup = container.querySelector('svg > g');
        expect(orbitGroup).toHaveClass('animate-card-orbit');
    });

    it('uses a drop-shadow filter definition', () => {
        const { container } = render(<CardSpinner />);
        expect(container.querySelector('#cs-shadow')).toBeInTheDocument();
    });

    it('each card group references the shadow filter', () => {
        const { container } = render(<CardSpinner />);
        const orbitGroup = container.querySelector('svg > g');
        const cardGroups = orbitGroup.querySelectorAll(':scope > g');
        cardGroups.forEach((g) => {
            expect(g).toHaveAttribute('filter', 'url(#cs-shadow)');
        });
    });

    it('renders the expected rank values on the cards', () => {
        const { container } = render(<CardSpinner />);
        const markup = container.innerHTML;
        expect(markup).toContain('>A<');
        expect(markup).toContain('>K<');
        expect(markup).toContain('>J<');
        expect(markup).toContain('>Q<');
        expect(markup).toContain('>10<');
    });
});
