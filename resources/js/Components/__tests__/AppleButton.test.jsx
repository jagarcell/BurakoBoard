import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import AppleButton from '@/Components/AppleButton';

// Ziggy's `route()` helper is not available in the test environment.
// Provide a minimal stand-in so the component can render without errors.
vi.stubGlobal('route', (name) => `/mocked-route/${name}`);

describe('AppleButton', () => {
    it('renders a link that points to the Apple redirect route', () => {
        render(<AppleButton />);

        const link = screen.getByRole('link', { name: /continue with apple/i });
        expect(link).toBeInTheDocument();
        expect(link).toHaveAttribute('href', '/mocked-route/auth.apple.redirect');
    });

    it('renders the Apple logo SVG', () => {
        const { container } = render(<AppleButton />);

        const svg = container.querySelector('svg');
        expect(svg).toBeInTheDocument();
    });

    it('applies additional className when provided', () => {
        render(<AppleButton className="my-extra-class" />);

        const link = screen.getByRole('link', { name: /continue with apple/i });
        expect(link.className).toContain('my-extra-class');
    });
});
