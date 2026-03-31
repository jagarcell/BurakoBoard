import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import api from '@/api/client';
import InviteUsersModal from '@/Components/InviteUsersModal';

vi.mock('@/api/client', () => ({
    default: {
        get: vi.fn(),
        post: vi.fn(),
    },
}));

const mockUsers = [
    { id: 1, name: 'Alice' },
    { id: 2, name: 'Bob' },
];

const makeUsersResponse = (users = mockUsers, currentPage = 1, lastPage = 1) => ({
    data: {
        data: {
            users: {
                data: users,
                meta: { current_page: currentPage, last_page: lastPage },
            },
        },
    },
});

describe('InviteUsersModal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('does not render when isOpen is false', () => {
        api.get.mockResolvedValue(makeUsersResponse());
        render(<InviteUsersModal isOpen={false} onClose={vi.fn()} gameId={1} />);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('fetches users when it opens', async () => {
        api.get.mockResolvedValue(makeUsersResponse());
        render(<InviteUsersModal isOpen onClose={vi.fn()} gameId={42} />);
        await waitFor(() => {
            expect(api.get).toHaveBeenCalledWith('/games/42/invitable-users', { params: { page: 1 } });
        });
    });

    it('renders a list of users after loading', async () => {
        api.get.mockResolvedValue(makeUsersResponse());
        render(<InviteUsersModal isOpen onClose={vi.fn()} gameId={1} />);
        await waitFor(() => {
            expect(screen.getByText('Alice')).toBeInTheDocument();
            expect(screen.getByText('Bob')).toBeInTheDocument();
        });
    });

    it('shows a loading spinner while fetching', async () => {
        let resolve;
        api.get.mockReturnValue(new Promise((res) => { resolve = res; }));
        render(<InviteUsersModal isOpen onClose={vi.fn()} gameId={1} />);
        expect(screen.getByLabelText('Loading users')).toBeInTheDocument();
        await act(async () => { resolve(makeUsersResponse()); });
    });

    it('shows an error message on fetch failure', async () => {
        api.get.mockRejectedValue(new Error('Network error'));
        render(<InviteUsersModal isOpen onClose={vi.fn()} gameId={1} />);
        await waitFor(() => {
            expect(screen.getByText(/unable to load users right now/i)).toBeInTheDocument();
        });
    });

    it('shows "No users available to invite" when response is empty', async () => {
        api.get.mockResolvedValue(makeUsersResponse([]));
        render(<InviteUsersModal isOpen onClose={vi.fn()} gameId={1} />);
        await waitFor(() => {
            expect(screen.getByText(/no users available to invite/i)).toBeInTheDocument();
        });
    });

    it('keeps the Send button disabled when no users are selected', async () => {
        api.get.mockResolvedValue(makeUsersResponse());
        render(<InviteUsersModal isOpen onClose={vi.fn()} gameId={1} />);
        await waitFor(() => screen.getByText('Alice'));
        expect(screen.getByRole('button', { name: /send/i })).toBeDisabled();
    });

    it('enables the Send button after a user is checked', async () => {
        api.get.mockResolvedValue(makeUsersResponse());
        render(<InviteUsersModal isOpen onClose={vi.fn()} gameId={1} />);
        await waitFor(() => screen.getByText('Alice'));
        fireEvent.click(screen.getAllByRole('checkbox')[0]);
        await waitFor(() => {
            expect(screen.getByRole('button', { name: /^send$/i })).not.toBeDisabled();
        });
    });

    it('posts the selected user IDs when Send is clicked', async () => {
        api.get.mockResolvedValue(makeUsersResponse());
        api.post.mockResolvedValue({ data: { data: { invited_count: 1 } } });
        render(<InviteUsersModal isOpen onClose={vi.fn()} gameId={5} />);
        await waitFor(() => screen.getByText('Alice'));

        fireEvent.click(screen.getAllByRole('checkbox')[0]);
        await waitFor(() => expect(screen.getByRole('button', { name: /send/i })).not.toBeDisabled());

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /send/i }));
        });
        expect(api.post).toHaveBeenCalledWith('/games/5/invitations', expect.objectContaining({
            user_ids: [1],
        }));
    });

    it('shows a success message after sending invitations', async () => {
        api.get.mockResolvedValue(makeUsersResponse());
        api.post.mockResolvedValue({ data: { data: { invited_count: 2 } } });
        render(<InviteUsersModal isOpen onClose={vi.fn()} gameId={1} />);
        await waitFor(() => screen.getByText('Alice'));

        fireEvent.click(screen.getAllByRole('checkbox')[0]);
        fireEvent.click(screen.getAllByRole('checkbox')[1]);
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
        });
        await waitFor(() => {
            expect(screen.getByText(/2 invitations sent successfully/i)).toBeInTheDocument();
        });
    });

    it('shows an error message when sending fails', async () => {
        api.get.mockResolvedValue(makeUsersResponse());
        api.post.mockRejectedValue(new Error('Server error'));
        render(<InviteUsersModal isOpen onClose={vi.fn()} gameId={1} />);
        await waitFor(() => screen.getByText('Alice'));
        fireEvent.click(screen.getAllByRole('checkbox')[0]);
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
        });
        await waitFor(() => {
            expect(
                screen.getByText(/unable to send invitations right now/i),
            ).toBeInTheDocument();
        });
    });

    it('hides the pagination controls when there is only one page', async () => {
        api.get.mockResolvedValue(makeUsersResponse(mockUsers, 1, 1));
        render(<InviteUsersModal isOpen onClose={vi.fn()} gameId={1} />);
        await waitFor(() => screen.getByText('Alice'));
        expect(screen.queryByRole('button', { name: /prev/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /next/i })).not.toBeInTheDocument();
    });

    it('shows pagination controls when there are multiple pages', async () => {
        api.get.mockResolvedValue(makeUsersResponse(mockUsers, 1, 3));
        render(<InviteUsersModal isOpen onClose={vi.fn()} gameId={1} />);
        await waitFor(() => screen.getByText('Alice'));
        expect(screen.getByRole('button', { name: /prev/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument();
    });

    it('fetches page 2 when Next is clicked', async () => {
        api.get.mockResolvedValue(makeUsersResponse(mockUsers, 1, 2));
        render(<InviteUsersModal isOpen onClose={vi.fn()} gameId={7} />);
        await waitFor(() => screen.getByText('Alice'));

        api.get.mockResolvedValue(makeUsersResponse([{ id: 3, name: 'Carol' }], 2, 2));
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /next/i }));
        });
        expect(api.get).toHaveBeenLastCalledWith('/games/7/invitable-users', { params: { page: 2 } });
    });

    it('calls onClose when the Close button is clicked', async () => {
        api.get.mockResolvedValue(makeUsersResponse());
        const onClose = vi.fn();
        render(<InviteUsersModal isOpen onClose={onClose} gameId={1} />);
        await waitFor(() => screen.getByText('Alice'));
        fireEvent.click(screen.getByRole('button', { name: /close/i }));
        expect(onClose).toHaveBeenCalled();
    });

    it('resets state and re-fetches when opened for a new game', async () => {
        api.get.mockResolvedValue(makeUsersResponse());
        const { rerender } = render(<InviteUsersModal isOpen={false} onClose={vi.fn()} gameId={1} />);
        await act(async () => {
            rerender(<InviteUsersModal isOpen onClose={vi.fn()} gameId={1} />);
        });
        await waitFor(() => {
            expect(api.get).toHaveBeenCalledWith('/games/1/invitable-users', { params: { page: 1 } });
        });
    });
});
