<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void Creates the game_player_seat table and seeds initial seat assignments.
     * Logic:
     *   1. Create game_player_seat (game_id, player_id, seat_number) with a composite PK and a
     *      unique constraint on (game_id, seat_number) to prevent two players sharing a seat.
     *   2. Seed seat numbers for all existing game-team-player relationships:
     *      - For each game, order its teams by team.id (ascending); the first team gets odd seats,
     *        the second team gets even seats.
     *      - Within each team, order players by player.id (ascending) to derive their initial position.
     *      - Seat formula: team slot 0 → position * 2 + 1 (1, 3, 5…); slot 1 → position * 2 + 2 (2, 4, 6…).
     */
    public function up(): void
    {
        Schema::create('game_player_seat', function (Blueprint $table): void {
            $table->foreignId('game_id')->constrained('games')->cascadeOnDelete();
            $table->foreignId('player_id')->constrained('players')->cascadeOnDelete();
            $table->unsignedSmallInteger('seat_number');
            $table->primary(['game_id', 'player_id']);
            $table->unique(['game_id', 'seat_number']);
            $table->index('player_id');
        });

        // Seed seat assignments from existing data.
        $gameIds = DB::table('games')->orderBy('id')->pluck('id');

        foreach ($gameIds as $gameId) {
            // Fetch the teams for this game ordered by team.id (ascending) so slot 0 → first team.
            $teamIds = DB::table('game_team')
                ->join('teams', 'teams.id', '=', 'game_team.team_id')
                ->where('game_team.game_id', $gameId)
                ->orderBy('teams.id')
                ->pluck('teams.id');

            foreach ($teamIds as $slot => $teamId) {
                // Fetch the players in this team ordered by player.id to establish initial positions.
                $playerIds = DB::table('team_player')
                    ->where('team_id', $teamId)
                    ->orderBy('player_id')
                    ->pluck('player_id');

                foreach ($playerIds as $position => $playerId) {
                    // Slot 0 (team 1) → odd seats 1, 3, 5 …
                    // Slot 1 (team 2) → even seats 2, 4, 6 …
                    $seatNumber = $slot === 0
                        ? $position * 2 + 1
                        : $position * 2 + 2;

                    DB::table('game_player_seat')->insertOrIgnore([
                        'game_id'     => $gameId,
                        'player_id'   => $playerId,
                        'seat_number' => $seatNumber,
                    ]);
                }
            }
        }
    }

    /**
     * Reverse the migrations.
     *
     * @return void Drops the game_player_seat table.
     * Logic: remove the seat-tracking table, which automatically deletes all seat assignments.
     */
    public function down(): void
    {
        Schema::dropIfExists('game_player_seat');
    }
};
