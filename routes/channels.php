<?php

use Illuminate\Support\Facades\Broadcast;
use Illuminate\Support\Facades\DB;

Broadcast::channel('App.Models.User.{id}', function ($user, $id) {
    return (int) $user->id === (int) $id;
});

/*
 * Authorise authenticated users who are active members of a game (any role
 * except pending_invitee) to subscribe to the private game channel.  This
 * channel carries real-time round-draft updates so viewers can watch scores
 * being entered as they happen.
 */
Broadcast::channel('game.{gameId}', function ($user, $gameId) {
    return DB::table('game_user')
        ->where('game_id', (int) $gameId)
        ->where('user_id', $user->id)
        ->where('role', '!=', 'pending_invitee')
        ->exists();
});
