import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import SeatedPlayerList from '@/Components/SeatedPlayerList';

const makePlayers = (overrides = []) =>
    overrides.map(({ id, display_name, seat_number = null }) => ({
        id,
        display_name,
        seat_number,
    }));

describe('SeatedPlayerList', () => {
    it('renders nothing when all players are removed', () => {
        const players = makePlayers([{ id: 1, display_name: 'Alice', seat_number: 1 }]);
        const { container } = render(
            <SeatedPlayerList
                players={players}
                removedIds={[1]}
                draggedPlayerId={null}
                dragOverPlayerId={null}
                touchingPlayerId={null}
                onDragStart={vi.fn()}
                onDragEnd={vi.fn()}
                onDragOver={vi.fn()}
                onDragLeave={vi.fn()}
                onDrop={vi.fn()}
                onRemove={vi.fn()}
            />,
        );
        expect(container.firstChild).toBeNull();
    });

    it('renders player names for all non-removed players', () => {
        const players = makePlayers([
            { id: 1, display_name: 'Alice', seat_number: 1 },
            { id: 2, display_name: 'Bob', seat_number: 2 },
        ]);
        render(
            <SeatedPlayerList
                players={players}
                removedIds={[]}
                draggedPlayerId={null}
                dragOverPlayerId={null}
                touchingPlayerId={null}
                onDragStart={vi.fn()}
                onDragEnd={vi.fn()}
                onDragOver={vi.fn()}
                onDragLeave={vi.fn()}
                onDrop={vi.fn()}
                onRemove={vi.fn()}
            />,
        );
        expect(screen.getByText('Alice')).toBeInTheDocument();
        expect(screen.getByText('Bob')).toBeInTheDocument();
    });

    it('filters out players whose id is in removedIds', () => {
        const players = makePlayers([
            { id: 1, display_name: 'Alice', seat_number: 1 },
            { id: 2, display_name: 'Bob', seat_number: 2 },
        ]);
        render(
            <SeatedPlayerList
                players={players}
                removedIds={[1]}
                draggedPlayerId={null}
                dragOverPlayerId={null}
                touchingPlayerId={null}
                onDragStart={vi.fn()}
                onDragEnd={vi.fn()}
                onDragOver={vi.fn()}
                onDragLeave={vi.fn()}
                onDrop={vi.fn()}
                onRemove={vi.fn()}
            />,
        );
        expect(screen.queryByText('Alice')).not.toBeInTheDocument();
        expect(screen.getByText('Bob')).toBeInTheDocument();
    });

    it('shows a seat badge for players with a seat_number', () => {
        const players = makePlayers([{ id: 1, display_name: 'Alice', seat_number: 3 }]);
        render(
            <SeatedPlayerList
                players={players}
                removedIds={[]}
                draggedPlayerId={null}
                dragOverPlayerId={null}
                touchingPlayerId={null}
                onDragStart={vi.fn()}
                onDragEnd={vi.fn()}
                onDragOver={vi.fn()}
                onDragLeave={vi.fn()}
                onDrop={vi.fn()}
                onRemove={vi.fn()}
            />,
        );
        expect(screen.getByLabelText('Seat 3')).toBeInTheDocument();
    });

    it('does not show a seat badge for players without a seat_number', () => {
        const players = makePlayers([{ id: 1, display_name: 'Alice', seat_number: null }]);
        render(
            <SeatedPlayerList
                players={players}
                removedIds={[]}
                draggedPlayerId={null}
                dragOverPlayerId={null}
                touchingPlayerId={null}
                onDragStart={vi.fn()}
                onDragEnd={vi.fn()}
                onDragOver={vi.fn()}
                onDragLeave={vi.fn()}
                onDrop={vi.fn()}
                onRemove={vi.fn()}
            />,
        );
        expect(screen.queryByLabelText(/Seat/)).not.toBeInTheDocument();
    });

    it('sorts players by seat_number ascending, nulls last', () => {
        const players = makePlayers([
            { id: 1, display_name: 'Charlie', seat_number: 3 },
            { id: 2, display_name: 'Alice', seat_number: 1 },
            { id: 3, display_name: 'Bob', seat_number: null },
        ]);
        render(
            <SeatedPlayerList
                players={players}
                removedIds={[]}
                draggedPlayerId={null}
                dragOverPlayerId={null}
                touchingPlayerId={null}
                onDragStart={vi.fn()}
                onDragEnd={vi.fn()}
                onDragOver={vi.fn()}
                onDragLeave={vi.fn()}
                onDrop={vi.fn()}
                onRemove={vi.fn()}
            />,
        );
        const items = screen.getAllByRole('listitem');
        expect(within(items[0]).getByText('Alice')).toBeInTheDocument();
        expect(within(items[1]).getByText('Charlie')).toBeInTheDocument();
        expect(within(items[2]).getByText('Bob')).toBeInTheDocument();
    });

    it('calls onRemove with the player id when the remove button is clicked', () => {
        const onRemove = vi.fn();
        const players = makePlayers([{ id: 5, display_name: 'Dana', seat_number: 1 }]);
        render(
            <SeatedPlayerList
                players={players}
                removedIds={[]}
                draggedPlayerId={null}
                dragOverPlayerId={null}
                touchingPlayerId={null}
                onDragStart={vi.fn()}
                onDragEnd={vi.fn()}
                onDragOver={vi.fn()}
                onDragLeave={vi.fn()}
                onDrop={vi.fn()}
                onRemove={onRemove}
            />,
        );
        fireEvent.click(screen.getByLabelText('Remove Dana'));
        expect(onRemove).toHaveBeenCalledWith(5);
    });

    it('applies opacity-40 class to the dragged player row', () => {
        const players = makePlayers([{ id: 1, display_name: 'Alice', seat_number: 1 }]);
        render(
            <SeatedPlayerList
                players={players}
                removedIds={[]}
                draggedPlayerId={1}
                dragOverPlayerId={null}
                touchingPlayerId={null}
                onDragStart={vi.fn()}
                onDragEnd={vi.fn()}
                onDragOver={vi.fn()}
                onDragLeave={vi.fn()}
                onDrop={vi.fn()}
                onRemove={vi.fn()}
            />,
        );
        const listItem = screen.getByRole('listitem');
        expect(listItem).toHaveClass('opacity-40');
    });

    it('applies indigo ring class to the drag-over player row', () => {
        const players = makePlayers([
            { id: 1, display_name: 'Alice', seat_number: 1 },
            { id: 2, display_name: 'Bob', seat_number: 2 },
        ]);
        render(
            <SeatedPlayerList
                players={players}
                removedIds={[]}
                draggedPlayerId={1}
                dragOverPlayerId={2}
                touchingPlayerId={null}
                onDragStart={vi.fn()}
                onDragEnd={vi.fn()}
                onDragOver={vi.fn()}
                onDragLeave={vi.fn()}
                onDrop={vi.fn()}
                onRemove={vi.fn()}
            />,
        );
        const items = screen.getAllByRole('listitem');
        // Bob (id=2) should have the indigo ring
        expect(items[1]).toHaveClass('ring-indigo-400');
    });
});
