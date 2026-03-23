<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class GameInvitationSent implements ShouldBroadcast
{
    use Dispatchable;
    use InteractsWithSockets;
    use SerializesModels;

    /**
     * Create a new event instance.
     *
     * @param  int     $inviteeId    Identifier of the user receiving the invitation.
     * @param  int     $gameId       Identifier of the game the invitation is for.
     * @param  string  $gameName     Human-readable name of the game.
     * @param  string  $inviterName  Display name of the user who sent the invitation.
     * @return void
     * Logic: stores the payload so broadcastWith() can expose it to the frontend Echo listener;
     *   the inviteeId drives channel targeting to ensure only the intended recipient receives
     *   the event on their private user channel.
     */
    public function __construct(
        public readonly int $inviteeId,
        public readonly int $gameId,
        public readonly string $gameName,
        public readonly string $inviterName,
    ) {}

    /**
     * Get the channels the event should broadcast on.
     *
     * @return array<int, \Illuminate\Broadcasting\Channel>
     * Logic: broadcasts on the user's private channel so only the authenticated invitee
     *   can receive the event; the channel name matches the existing authorization rule
     *   in routes/channels.php.
     */
    public function broadcastOn(): array
    {
        return [
            new PrivateChannel('App.Models.User.' . $this->inviteeId),
        ];
    }

    /**
     * Get the data to broadcast with the event.
     *
     * @return array<string, mixed>
     * Logic: exposes the minimal payload needed for the frontend to show a notification
     *   and update the bell icon state without an additional HTTP request.
     */
    public function broadcastWith(): array
    {
        return [
            'game_id'      => $this->gameId,
            'game_name'    => $this->gameName,
            'inviter_name' => $this->inviterName,
        ];
    }

    /**
     * Get the broadcast event name.
     *
     * @return string
     * Logic: uses a short, namespaced name so the frontend listener is explicit and
     *   not coupled to PHP class naming conventions.
     */
    public function broadcastAs(): string
    {
        return 'game.invitation.sent';
    }
}
