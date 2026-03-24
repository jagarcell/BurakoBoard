<?php

namespace App\Events;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class RoundDraftUpdated implements ShouldBroadcast
{
    use Dispatchable;
    use InteractsWithSockets;
    use SerializesModels;

    /**
     * Create a new RoundDraftUpdated event.
     *
     * @param  int  $gameId      The game whose draft was updated.
     * @param  array<string, mixed>  $baseInputs  Per-team element values broadcast to listeners.
     * @param  array<string, mixed>  $cardInputs  Per-team card counts broadcast to listeners.
     * @return void
     * Logic: store the game ID and both input maps so they can be serialised and
     * broadcast to every authenticated member of the game channel except the sender.
     */
    public function __construct(
        public readonly int $gameId,
        public readonly array $baseInputs,
        public readonly array $cardInputs,
    ) {}

    /**
     * Get the broadcast channels for the event.
     *
     * @return array<int, \Illuminate\Broadcasting\Channel>
     * Logic: broadcast on the private game channel so only authenticated users
     * who are members of the game can receive the event.
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
     * Logic: include both input maps so the frontend can hydrate the live-preview
     * scoring form for viewers without an additional HTTP round-trip.
     */
    public function broadcastWith(): array
    {
        return [
            'base_inputs' => $this->baseInputs,
            'card_inputs' => $this->cardInputs,
        ];
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
        return 'round.draft.updated';
    }
}
