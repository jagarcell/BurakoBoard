<?php

namespace App\Repositories;

use App\Models\Game;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class SeatRepository
{
    /**
     * Find a seated player in the context of a specific game.
     *
     * @param  int  $gameId    Identifier of the game.
     * @param  int  $playerId  Identifier of the player.
     * @return object|null A row containing player identity and seat info, or null when missing.
     * Logic: join game_team, team_player, players, and game_player_seat to ensure the player
     * belongs to one of the game's teams and has a concrete seat assignment in that game.
     */
    public function findSeatedPlayerInGame(int $gameId, int $playerId): ?object
    {
        return DB::table('game_team')
            ->join('team_player', 'team_player.team_id', '=', 'game_team.team_id')
            ->join('players', 'players.id', '=', 'team_player.player_id')
            ->join('game_player_seat', function ($join) use ($gameId): void {
                $join->on('game_player_seat.player_id', '=', 'players.id')
                    ->where('game_player_seat.game_id', '=', $gameId);
            })
            ->where('game_team.game_id', $gameId)
            ->where('players.id', $playerId)
            ->select([
                'players.id as player_id',
                'players.display_name',
                'game_player_seat.seat_number',
            ])
            ->first();
    }

    /**
     * Return all seated players participating in a game.
     *
     * @param  int  $gameId  Identifier of the game.
     * @return \Illuminate\Support\Collection<int, object> Rows containing player identity and seat data.
     * Logic: join game_team, team_player, players, and game_player_seat so only players that
     *   belong to one of the game's teams and currently have a seat assignment in that game are returned.
     */
    public function getSeatedPlayersForGame(int $gameId): Collection
    {
        return DB::table('game_team')
            ->join('team_player', 'team_player.team_id', '=', 'game_team.team_id')
            ->join('players', 'players.id', '=', 'team_player.player_id')
            ->join('game_player_seat', function ($join) use ($gameId): void {
                $join->on('game_player_seat.player_id', '=', 'players.id')
                    ->where('game_player_seat.game_id', '=', $gameId);
            })
            ->where('game_team.game_id', $gameId)
            ->select([
                'players.id as player_id',
                'players.display_name',
                'game_player_seat.seat_number',
            ])
            ->orderBy('game_player_seat.seat_number')
            ->get();
    }

    /**
     * Compute and persist the seat number for a player joining a team in a game.
     *
     * @param  int  $gameId    Identifier of the game.
     * @param  int  $teamId    Identifier of the team the player is joining.
     * @param  int  $playerId  Identifier of the player being seated.
     * @return void Inserts or replaces the player's seat assignment for this game.
     * Logic:
     *   1. Determine the team's slot (0 = first team by id, 1 = second team by id) within the game.
     *   2. Count how many players from this team already have a seat in this game.
     *   3. Compute: slot 0 → position * 2 + 1 (odd, 1 3 5…); slot 1 → position * 2 + 2 (even, 2 4 6…).
     *   4. Insert the row, ignoring duplicates to keep the operation idempotent.
     */
    public function assignPlayerSeat(int $gameId, int $teamId, int $playerId): void
    {
        $teamIds = DB::table('game_team')
            ->join('teams', 'teams.id', '=', 'game_team.team_id')
            ->where('game_team.game_id', $gameId)
            ->orderBy('teams.id')
            ->pluck('teams.id');

        $slot = $teamIds->search($teamId);

        if ($slot === false) {
            return;
        }

        $existingCount = DB::table('game_player_seat')
            ->join('team_player', 'team_player.player_id', '=', 'game_player_seat.player_id')
            ->where('game_player_seat.game_id', $gameId)
            ->where('team_player.team_id', $teamId)
            ->count();

        $seatNumber = $slot === 0
            ? $existingCount * 2 + 1
            : $existingCount * 2 + 2;

        DB::table('game_player_seat')->insertOrIgnore([
            'game_id'     => $gameId,
            'player_id'   => $playerId,
            'seat_number' => $seatNumber,
        ]);
    }

    /**
     * Delete all seat assignments for a game and recompute them from scratch.
     *
     * @param  int  $gameId  Identifier of the game whose seats should be re-derived.
     * @return void Replaces all game_player_seat rows using the canonical slot order.
     * Logic: clear existing seat rows for the game, then iterate teams in ascending teams.id order
     * (slot 0 = lowest id, slot 1 = second lowest id). Within each team, iterate players in ascending
     * player.id order to derive their position index. Seat formula: slot 0 → position * 2 + 1;
     * slot 1 → position * 2 + 2.
     */
    public function reassignAllSeatsForGame(int $gameId): void
    {
        DB::table('game_player_seat')
            ->where('game_id', $gameId)
            ->delete();

        $teamIds = DB::table('game_team')
            ->join('teams', 'teams.id', '=', 'game_team.team_id')
            ->where('game_team.game_id', $gameId)
            ->orderBy('teams.id')
            ->pluck('teams.id');

        foreach ($teamIds as $slot => $teamId) {
            $playerIds = DB::table('team_player')
                ->where('team_id', $teamId)
                ->orderBy('player_id')
                ->pluck('player_id');

            foreach ($playerIds as $position => $playerId) {
                $seatNumber = $slot === 0
                    ? $position * 2 + 1
                    : $position * 2 + 2;

                DB::table('game_player_seat')->insert([
                    'game_id'     => $gameId,
                    'player_id'   => (int) $playerId,
                    'seat_number' => $seatNumber,
                ]);
            }
        }
    }

    /**
     * Remove the seat assignment for a player across all games where the given team participates.
     *
     * @param  int  $teamId    Identifier of the team the player is being removed from.
     * @param  int  $playerId  Identifier of the player whose seats should be cleared.
     * @return void Deletes seat rows for every game that includes this team.
     * Logic: since team_player membership is not game-scoped, removing a player from a team
     * implies removing them from every game where that team plays.
     */
    public function removePlayerSeatForTeam(int $teamId, int $playerId): void
    {
        $gameIds = DB::table('game_team')
            ->where('team_id', $teamId)
            ->pluck('game_id');

        DB::table('game_player_seat')
            ->whereIn('game_id', $gameIds)
            ->where('player_id', $playerId)
            ->delete();
    }

    /**
     * Swap the seat numbers of two players within a single game atomically.
     *
     * @param  int  $gameId     Identifier of the game in which the swap takes place.
     * @param  int  $playerIdA  Identifier of the first player.
     * @param  int  $playerIdB  Identifier of the second player.
     * @return void Updates both rows so each player holds the other's original seat number.
     * Logic: reads both current seat numbers, then performs the swap inside a DB transaction
     * using a temporary seat value of 0 to avoid violating the unique(game_id, seat_number)
     * constraint during the intermediate state.
     */
    public function swapPlayerSeats(int $gameId, int $playerIdA, int $playerIdB): void
    {
        DB::transaction(function () use ($gameId, $playerIdA, $playerIdB): void {
            $seatA = DB::table('game_player_seat')
                ->where('game_id', $gameId)
                ->where('player_id', $playerIdA)
                ->value('seat_number');

            $seatB = DB::table('game_player_seat')
                ->where('game_id', $gameId)
                ->where('player_id', $playerIdB)
                ->value('seat_number');

            if ($seatA === null || $seatB === null) {
                return;
            }

            // Step through a temporary seat (0) to avoid the unique-constraint conflict.
            DB::table('game_player_seat')
                ->where('game_id', $gameId)
                ->where('player_id', $playerIdA)
                ->update(['seat_number' => 0]);

            DB::table('game_player_seat')
                ->where('game_id', $gameId)
                ->where('player_id', $playerIdB)
                ->update(['seat_number' => $seatA]);

            DB::table('game_player_seat')
                ->where('game_id', $gameId)
                ->where('player_id', $playerIdA)
                ->update(['seat_number' => $seatB]);
        });
    }

    /**
     * Copy all game_player_seat rows from a source game into a newly created game.
     *
     * @param  int  $sourceGameId  Identifier of the finished game to copy seats from.
     * @param  int  $newGameId  Identifier of the freshly created rematch game.
     * @return void Inserts one seat row per player in the new game matching the source seat assignments.
     * Logic: select every game_player_seat row belonging to the source game and bulk-insert
     * equivalent rows for the new game, preserving player_id and seat_number.
     */
    public function copySeatsFromGame(int $sourceGameId, int $newGameId): void
    {
        $rows = DB::table('game_player_seat')
            ->where('game_id', $sourceGameId)
            ->get(['player_id', 'seat_number'])
            ->map(fn (object $row): array => [
                'game_id'     => $newGameId,
                'player_id'   => (int) $row->player_id,
                'seat_number' => (int) $row->seat_number,
            ])
            ->all();

        if (! empty($rows)) {
            DB::table('game_player_seat')->insert($rows);
        }
    }

    /**
     * Compute the seat number of the player who would be cutter in the next round of a finished game.
     *
     * @param  \App\Models\Game  $game  The finished game from which the next cutter is derived.
     * @return int|null The seat number of the next cutter, or null when roles cannot be determined.
     * Logic: load the initial_shuffler_seat_number and current_round_number from the supplied game
     * model, then collect all seated players for the game sorted by seat_number. The next cutter is
     * the player at index (initialIndex + currentRoundNumber) % totalPlayers, which is exactly one
     * rotation beyond the last played round's cutter.
     */
    public function computeNextCutterSeatNumber(Game $game): ?int
    {
        if ($game->initial_shuffler_seat_number === null) {
            return null;
        }

        $seats = DB::table('game_player_seat')
            ->where('game_id', $game->id)
            ->orderBy('seat_number')
            ->pluck('seat_number')
            ->map(fn ($s) => (int) $s)
            ->values();

        $totalPlayers = $seats->count();

        if ($totalPlayers < 4) {
            return null;
        }

        $initialSeat  = (int) $game->initial_shuffler_seat_number;
        $initialIndex = $seats->search($initialSeat);

        if ($initialIndex === false) {
            return null;
        }

        $roundNumber = (int) $game->current_round_number;
        $nextIndex   = ($initialIndex + $roundNumber) % $totalPlayers;

        return $seats[$nextIndex];
    }
}
