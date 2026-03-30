<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migration.
     *
     * @return void Adds rematch_from_game_id to games after winning_team_id.
     * Logic: the nullable foreign key records which game triggered the creation of this game
     *   as a rematch, enabling the full chain of rematches to be queried. A self-referencing
     *   FK with nullOnDelete preserves the row even if the parent game is deleted.
     *   An index is added because the column will be used in WHERE clauses when fetching
     *   all games that share the same rematch chain.
     */
    public function up(): void
    {
        Schema::table('games', function (Blueprint $table): void {
            $table->unsignedBigInteger('rematch_from_game_id')
                ->nullable()
                ->after('winning_team_id');

            $table->foreign('rematch_from_game_id')
                ->references('id')
                ->on('games')
                ->nullOnDelete();

            $table->index('rematch_from_game_id');
        });
    }

    /**
     * Reverse the migration.
     *
     * @return void Drops the foreign key, index, and column added by up().
     * Logic: mirror the up() additions in reverse order so a rollback cleanly restores the table.
     */
    public function down(): void
    {
        Schema::table('games', function (Blueprint $table): void {
            $table->dropForeign(['rematch_from_game_id']);
            $table->dropIndex(['rematch_from_game_id']);
            $table->dropColumn('rematch_from_game_id');
        });
    }
};
