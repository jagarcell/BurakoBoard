<?php

namespace App\Events;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class GameUpdated implements ShouldBroadcast
{
    use Dispatchable;
    use InteractsWithSockets;
    use SerializesModels;

    /**
     * Create a new GameUpdated event.
     *
     * @param  int  $gameId   The game whose state was updated.
     * @param  array<string, mixed>  $summary  Full game summary snapshot broadcast to listeners.
     * @return void
     * Logic: store the game ID and the complete summary so listeners can replace their local
     * state with the server-authoritative version without an additional HTTP round-trip.
     */
    public function __construct(
        public readonly int $gameId,
        public readonly array $summary,
    ) {}

    /**
     * Get the broadcast channels for the event.
     *
     * @return array<int, \Illuminate\Broadcasting\Channel>
     * Logic: broadcast on the private game channel so only authenticated members
     * of this game can receive the event.
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
     * @return array<string, mixed>
     * Logic: forward the full game summary so the frontend can update teams, rounds,
     * round roles, and game metadata in a single message without any extra requests.
     */
    public function broadcastWith(): array
    {
        return $this->summary;
    }

    /**
     * Get the broadcast event name.
     *
     * @return string
     * Logic: use a dot-separated name that the frontend Echo listener registers
     * with a leading dot to indicate a custom (non-class-based) event name.
     */
    public function broadcastAs(): string
    {
        return 'game.updated';
    }
}
