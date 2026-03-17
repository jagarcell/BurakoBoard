import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import GoogleButton from '@/Components/GoogleButton';

// Ziggy's `route()` helper is not available in the test environment.
// Provide a minimal stand-in so the component can render without errors.
vi.stubGlobal('route', (name) => `/mocked-route/${name}`);

describe('GoogleButton', () => {
    it('renders a link that points to the Google redirect route', () => {
        render(<GoogleButton />);

        const link = screen.getByRole('link', { name: /continue with google/i });
        expect(link).toBeInTheDocument();
        expect(link).toHaveAttribute('href', '/mocked-route/auth.google.redirect');
    });

    it('renders the Google logo SVG', () => {
        const { container } = render(<GoogleButton />);

        const svg = container.querySelector('svg');
        expect(svg).toBeInTheDocument();
    });

    it('applies additional className when provided', () => {
        render(<GoogleButton className="my-extra-class" />);

        const link = screen.getByRole('link', { name: /continue with google/i });
        expect(link.className).toContain('my-extra-class');
    });
});
