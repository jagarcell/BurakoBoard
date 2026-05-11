<?php

namespace App\Events;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class GameRoleUpdated implements ShouldBroadcast
{
    use Dispatchable;
    use InteractsWithSockets;
    use SerializesModels;

    /**
     * Create a new GameRoleUpdated event.
     *
     * @param  int     $userId   Identifier of the user whose role changed.
     * @param  int     $gameId   Identifier of the game in which the role changed.
     * @param  string  $newRole  The new role value assigned to the user.
     * @return void
     * Logic: store the user ID, game ID, and new role so the frontend can locate the
     *   affected game in its local list and update its user_role without any extra
     *   HTTP round-trip or full page reload.
     */
    public function __construct(
        public readonly int $userId,
        public readonly int $gameId,
        public readonly string $newRole,
    ) {}

    /**
     * Get the broadcast channels for the event.
     *
     * @return array<int, \Illuminate\Broadcasting\Channel>
     * Logic: broadcast on the affected user's private notification channel so only
     *   that specific user receives the role-change event.
     */
    public function broadcastOn(): array
    {
        return [
            new PrivateChannel('App.Models.User.' . $this->userId),
        ];
    }

    /**
     * Get the data to broadcast with the event.
     *
     * @return array<string, mixed>
     * Logic: send only the game ID and the new role value so the frontend can do a
     *   targeted merge into its games list without replacing the full game object.
     */
    public function broadcastWith(): array
    {
        return [
            'game_id'  => $this->gameId,
            'new_role' => $this->newRole,
        ];
    }

    /**
     * Get the broadcast event name.
     *
     * @return string
     * Logic: use a dot-separated name matching the Echo listener's leading-dot
     *   convention for custom (non-class-based) event names.
     */
    public function broadcastAs(): string
    {
        return 'game.role.updated';
    }
}
