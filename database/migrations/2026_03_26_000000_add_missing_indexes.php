<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void Adds targeted indexes for columns used in WHERE/JOIN/ORDER BY clauses.
     * Logic: games.status is filtered in game-list and rematch checks; round_scores.team_id
     *   is used in recomputeTeamScoreFromHistory joins; team_player.player_id is used in
     *   getTeamPlayerIds join where only player_id is in the leading position; the composite
     *   round_drafts(game_id, round_number) unique index already exists from a previous
     *   migration so it is not reduplicated here.
     */
    public function up(): void
    {
        Schema::table('games', function (Blueprint $table): void {
            $indexes = collect(Schema::getIndexes('games'))->pluck('name')->all();

            if (! in_array('games_status_index', $indexes, true)) {
                $table->index('status');
            }
        });

        Schema::table('round_scores', function (Blueprint $table): void {
            $indexes = collect(Schema::getIndexes('round_scores'))->pluck('name')->all();

            if (! in_array('round_scores_team_id_index', $indexes, true)) {
                $table->index('team_id');
            }
        });

        Schema::table('team_player', function (Blueprint $table): void {
            $indexes = collect(Schema::getIndexes('team_player'))->pluck('name')->all();

            if (! in_array('team_player_player_id_index', $indexes, true)) {
                $table->index('player_id');
            }
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void Drops the three targeted indexes added by this migration.
     * Logic: mirror the up() additions so rollback restores the previous index state.
     */
    public function down(): void
    {
        Schema::table('games', function (Blueprint $table): void {
            $table->dropIndex(['status']);
        });

        Schema::table('round_scores', function (Blueprint $table): void {
            $table->dropIndex(['team_id']);
        });

        Schema::table('team_player', function (Blueprint $table): void {
            $table->dropIndex(['player_id']);
        });
    }
};
