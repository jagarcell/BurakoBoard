/**
 * Renders the list of currently-seated players inside the edit-team modal.
 * Supports both HTML5 drag-and-drop (desktop) and touch-based drag (iOS).
 *
 * @param {Array}        props.players            - Full existing-players array for the team being edited.
 * @param {number[]}     props.removedIds         - IDs of players marked for removal (filtered out).
 * @param {number|null}  props.draggedPlayerId    - ID of the player being HTML5-dragged (for opacity style).
 * @param {number|null}  props.dragOverPlayerId   - ID of the player currently hovered over during drag (for highlight).
 * @param {number|null}  props.touchingPlayerId   - ID of the player being touch-dragged (applies same opacity as drag).
 * @param {function}     props.onDragStart        - (playerId: number) => void
 * @param {function}     props.onDragEnd          - () => void
 * @param {function}     props.onDragOver         - (playerId: number) => void
 * @param {function}     props.onDragLeave        - () => void
 * @param {function}     props.onDrop             - (draggedId: number, targetId: number) => void
 * @param {function}     props.onRemove           - (playerId: number) => void — marks a player for removal.
 * @return {JSX.Element|null} — null when all players are filtered out.
 *
 * Logic: Filters out removed IDs, sorts by seat_number (nulls last), then renders a
 * draggable list item per player. Each item has data-player-id to enable the parent's
 * document-level iOS touch handlers. HTML5 drag events are wired as React props.
 */
export default function SeatedPlayerList({
    players,
    removedIds = [],
    draggedPlayerId,
    dragOverPlayerId,
    touchingPlayerId,
    onDragStart,
    onDragEnd,
    onDragOver,
    onDragLeave,
    onDrop,
    onRemove,
}) {
    const visible = players
        .filter((p) => !removedIds.includes(p.id))
        .sort((a, b) => {
            if (a.seat_number == null && b.seat_number == null) return 0;
            if (a.seat_number == null) return 1;
            if (b.seat_number == null) return -1;
            return a.seat_number - b.seat_number;
        });

    if (visible.length === 0) return null;

    return (
        <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
                Current players
            </p>
            <p className="text-xs text-slate-400 -mt-1">Drag &amp; Drop Players to swap seats</p>
            <ul className="space-y-1">
                {visible.map((player) => (
                    <li
                        key={player.id}
                        data-player-id={player.seat_number != null ? player.id : undefined}
                        draggable={player.seat_number != null}
                        onDragStart={() => onDragStart(player.id)}
                        onDragEnd={onDragEnd}
                        onDragOver={(e) => {
                            if (
                                draggedPlayerId !== null &&
                                draggedPlayerId !== player.id &&
                                player.seat_number != null
                            ) {
                                e.preventDefault();
                                onDragOver(player.id);
                            }
                        }}
                        onDragLeave={onDragLeave}
                        onDrop={(e) => {
                            e.preventDefault();
                            if (draggedPlayerId !== null && draggedPlayerId !== player.id) {
                                onDrop(draggedPlayerId, player.id);
                            }
                        }}
                        className={[
                            'flex items-center justify-between rounded-lg px-3 py-2 text-sm text-slate-700 transition select-none',
                            draggedPlayerId === player.id
                                ? 'opacity-40 bg-slate-100 ring-2 ring-inset ring-slate-300'
                                : dragOverPlayerId === player.id
                                    ? 'bg-indigo-50 ring-2 ring-inset ring-indigo-400'
                                    : 'bg-slate-50',
                            player.seat_number != null ? 'cursor-grab active:cursor-grabbing' : '',
                            touchingPlayerId === player.id ? 'opacity-40 bg-slate-100 ring-2 ring-inset ring-slate-300' : '',
                        ].join(' ')}
                    >
                        <div className="flex min-w-0 items-center gap-2">
                            {player.seat_number != null ? (
                                <span
                                    aria-label={`Seat ${player.seat_number}`}
                                    className="flex flex-shrink-0 items-center justify-center rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-500"
                                >
                                    Seat {player.seat_number}
                                </span>
                            ) : null}
                            <span className="truncate">{player.display_name}</span>
                        </div>
                        <button
                            aria-label={`Remove ${player.display_name}`}
                            className="ml-2 text-slate-400 hover:text-red-500"
                            onClick={() => onRemove(player.id)}
                            type="button"
                        >
                            ×
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );
}
