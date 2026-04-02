import '@testing-library/jest-dom/vitest';
import { render } from '@testing-library/react';
import ApplicationLogo from '@/Components/ApplicationLogo';

describe('ApplicationLogo', () => {
    it('renders an SVG element', () => {
        const { container } = render(<ApplicationLogo />);
        const svg = container.querySelector('svg');
        expect(svg).toBeInTheDocument();
    });

    it('applies className prop to the SVG element', () => {
        const { container } = render(<ApplicationLogo className="h-20 w-20" />);
        const svg = container.querySelector('svg');
        expect(svg).toHaveClass('h-20', 'w-20');
    });

    it('renders five playing card groups', () => {
        const { container } = render(<ApplicationLogo />);
        // The defs element is also a direct child, cards are the <g> children
        const groups = container.querySelectorAll('svg > g');
        expect(groups).toHaveLength(5);
    });

    it('renders the casino table oval background', () => {
        const { container } = render(<ApplicationLogo />);
        const ellipses = container.querySelectorAll('svg > ellipse');
        expect(ellipses.length).toBeGreaterThanOrEqual(3);
    });

    it('renders the table felt ellipse with casino blue gradient', () => {
        const { container } = render(<ApplicationLogo />);
        const feltEllipse = container.querySelector('ellipse[fill="url(#table-felt)"]');
        expect(feltEllipse).toBeInTheDocument();
    });

    it('renders the table-felt radial gradient in defs', () => {
        const { container } = render(<ApplicationLogo />);
        const gradient = container.querySelector('radialGradient#table-felt');
        expect(gradient).toBeInTheDocument();
    });

    it('renders all four suit symbols', () => {
        const { container } = render(<ApplicationLogo />);
        const svgText = container.innerHTML;
        expect(svgText).toContain('♠');
        expect(svgText).toContain('♥');
        expect(svgText).toContain('♣');
        expect(svgText).toContain('♦');
    });

    it('renders black suits in dark color', () => {
        const { container } = render(<ApplicationLogo />);
        const darkTexts = container.querySelectorAll('text[fill="#111827"]');
        expect(darkTexts.length).toBeGreaterThan(0);
    });

    it('renders red suits in red color', () => {
        const { container } = render(<ApplicationLogo />);
        const redTexts = container.querySelectorAll('text[fill="#DC2626"]');
        expect(redTexts.length).toBeGreaterThan(0);
    });

    it('passes extra props through to the SVG element', () => {
        const { container } = render(<ApplicationLogo data-testid="app-logo" />);
        const svg = container.querySelector('svg');
        expect(svg).toHaveAttribute('data-testid', 'app-logo');
    });
});
