<?php

namespace App\Events;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class GameDeleted implements ShouldBroadcast
{
    use Dispatchable;
    use InteractsWithSockets;
    use SerializesModels;

    /**
     * Create a new GameDeleted event.
     *
     * @param  int  $gameId  Identifier of the game that was deleted.
     * @return void
     * Logic: store the game ID so the frontend can match it against the currently
     *   selected game and reset the dropdown to the placeholder option.
     */
    public function __construct(
        public readonly int $gameId,
    ) {}

    /**
     * Get the broadcast channels for the event.
     *
     * @return array<int, \Illuminate\Broadcasting\Channel>
     * Logic: broadcast on the private game channel. This event must be dispatched
     *   *before* the DB row is removed so the channel-auth guard can still verify
     *   that the subscriber is a member of the game.
     */
    public function broadcastOn(): array
    {
        return [
            new PrivateChannel('game.' . $this->gameId),
        ];
    }

    /**
     * Get the data to broadcast with the event.
     *
     * @return array<string, int>
     * Logic: send only the game ID so the frontend can identify which dropdown
     *   entry to remove without carrying any other sensitive game state.
     */
    public function broadcastWith(): array
    {
        return ['game_id' => $this->gameId];
    }

    /**
     * Get the broadcast event name.
     *
     * @return string
     * Logic: use a dot-separated name matching the Echo listener's leading-dot
     *   convention for custom event names (e.g. `.game.deleted`).
     */
    public function broadcastAs(): string
    {
        return 'game.deleted';
    }
}
