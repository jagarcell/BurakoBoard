import '@testing-library/jest-dom/vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import api from '@/api/client';
import DelegateHostModal from '@/Components/DelegateHostModal';

vi.mock('@/api/client', () => ({
    default: {
        get: vi.fn(),
        put: vi.fn(),
    },
}));

const mockViewers = [
    { id: 10, name: 'Alice Viewer', email: 'alice@example.com' },
    { id: 11, name: 'Bob Viewer', email: 'bob@example.com' },
];

const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    gameId: 5,
    onSuccess: vi.fn(),
};

const renderModal = (props = {}) =>
    render(<DelegateHostModal {...defaultProps} {...props} />);

describe('DelegateHostModal', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('renders the heading and description when open', async () => {
        api.get.mockResolvedValue({ data: { data: { viewers: [] } } });

        await act(async () => {
            renderModal();
        });

        expect(screen.getByText('Delegate Host Role')).toBeInTheDocument();
        expect(
            screen.getByText(/select a viewer to become the new host/i),
        ).toBeInTheDocument();
    });

    it('shows a spinner while loading viewers', async () => {
        let resolveGet;
        api.get.mockReturnValue(new Promise((res) => { resolveGet = res; }));

        await act(async () => {
            renderModal();
        });

        expect(screen.getByLabelText('Loading viewers')).toBeInTheDocument();

        // Resolve so the test does not leak pending promises.
        await act(async () => {
            resolveGet({ data: { data: { viewers: [] } } });
        });
    });

    it('displays viewer list after successful fetch', async () => {
        api.get.mockResolvedValue({ data: { data: { viewers: mockViewers } } });

        await act(async () => {
            renderModal();
        });

        await waitFor(() => {
            expect(screen.getByText('Alice Viewer')).toBeInTheDocument();
        });

        expect(screen.getByText('alice@example.com')).toBeInTheDocument();
        expect(screen.getByText('Bob Viewer')).toBeInTheDocument();
        expect(screen.getByText('bob@example.com')).toBeInTheDocument();
    });

    it('shows an empty-state message when no viewers are returned', async () => {
        api.get.mockResolvedValue({ data: { data: { viewers: [] } } });

        await act(async () => {
            renderModal();
        });

        await waitFor(() => {
            expect(
                screen.getByText('No viewers are following this game yet.'),
            ).toBeInTheDocument();
        });
    });

    it('shows a load-error message when the fetch fails', async () => {
        api.get.mockRejectedValue(new Error('Network error'));

        await act(async () => {
            renderModal();
        });

        await waitFor(() => {
            expect(
                screen.getByText(/unable to load viewers right now/i),
            ).toBeInTheDocument();
        });
    });

    it('Confirm button is disabled until a viewer is selected', async () => {
        api.get.mockResolvedValue({ data: { data: { viewers: mockViewers } } });

        await act(async () => {
            renderModal();
        });

        await waitFor(() => {
            expect(screen.getByText('Alice Viewer')).toBeInTheDocument();
        });

        const confirmBtn = screen.getByRole('button', { name: /confirm/i });
        expect(confirmBtn).toBeDisabled();
    });

    it('enables Confirm button after selecting a viewer', async () => {
        const user = userEvent.setup();
        api.get.mockResolvedValue({ data: { data: { viewers: mockViewers } } });

        await act(async () => {
            renderModal();
        });

        await waitFor(() => {
            expect(screen.getByText('Alice Viewer')).toBeInTheDocument();
        });

        const radios = screen.getAllByRole('radio');
        await user.click(radios[0]);

        expect(screen.getByRole('button', { name: /confirm/i })).not.toBeDisabled();
    });

    it('calls PUT /games/{id}/host and onSuccess on successful delegation', async () => {
        const user = userEvent.setup();
        const updatedGame = { id: 5, name: 'Test Game', user_role: 'viewer' };

        api.get.mockResolvedValue({ data: { data: { viewers: mockViewers } } });
        api.put.mockResolvedValue({ data: { data: { game: updatedGame } } });

        await act(async () => {
            renderModal();
        });

        await waitFor(() => {
            expect(screen.getByText('Alice Viewer')).toBeInTheDocument();
        });

        const radios = screen.getAllByRole('radio');
        await user.click(radios[0]);

        await user.click(screen.getByRole('button', { name: /confirm/i }));

        await waitFor(() => {
            expect(api.put).toHaveBeenCalledWith('/games/5/host', { user_id: mockViewers[0].id });
            expect(defaultProps.onSuccess).toHaveBeenCalledWith(updatedGame);
            expect(defaultProps.onClose).toHaveBeenCalled();
        });
    });

    it('shows a submit error when the delegation API call fails', async () => {
        const user = userEvent.setup();

        api.get.mockResolvedValue({ data: { data: { viewers: mockViewers } } });
        api.put.mockRejectedValue(new Error('Server error'));

        await act(async () => {
            renderModal();
        });

        await waitFor(() => {
            expect(screen.getByText('Alice Viewer')).toBeInTheDocument();
        });

        const radios = screen.getAllByRole('radio');
        await user.click(radios[0]);
        await user.click(screen.getByRole('button', { name: /confirm/i }));

        await waitFor(() => {
            expect(
                screen.getByText(/unable to delegate the host role right now/i),
            ).toBeInTheDocument();
        });
    });

    it('shows a server-provided user_id error message on 422', async () => {
        const user = userEvent.setup();

        api.get.mockResolvedValue({ data: { data: { viewers: mockViewers } } });
        api.put.mockRejectedValue({
            response: {
                data: {
                    data: {
                        errors: { user_id: ['The selected user is not a viewer of this game.'] },
                    },
                },
            },
        });

        await act(async () => {
            renderModal();
        });

        await waitFor(() => {
            expect(screen.getByText('Alice Viewer')).toBeInTheDocument();
        });

        const radios = screen.getAllByRole('radio');
        await user.click(radios[0]);
        await user.click(screen.getByRole('button', { name: /confirm/i }));

        await waitFor(() => {
            expect(
                screen.getByText('The selected user is not a viewer of this game.'),
            ).toBeInTheDocument();
        });
    });

    it('Cancel button calls onClose', async () => {
        api.get.mockResolvedValue({ data: { data: { viewers: [] } } });

        await act(async () => {
            renderModal();
        });

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
        });

        await userEvent.setup().click(screen.getByRole('button', { name: /cancel/i }));
        expect(defaultProps.onClose).toHaveBeenCalled();
    });
});
