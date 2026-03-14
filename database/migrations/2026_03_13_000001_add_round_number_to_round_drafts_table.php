<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void Adds round_number to round_drafts and changes the unique constraint.
     * Logic: a value of 0 represents the active (in-progress) draft; a positive integer
     * identifies a draft that was archived when its corresponding round was committed.
     * The unique constraint shifts from (game_id) to (game_id, round_number) so that one
     * active draft (round_number = 0) and one archived draft per round number can coexist
     * for the same game, enabling per-round scoring detail lookups.
     */
    public function up(): void
    {
        Schema::table('round_drafts', function (Blueprint $table): void {
            if (! Schema::hasColumn('round_drafts', 'round_number')) {
                $table->unsignedSmallInteger('round_number')->default(0)->after('game_id');
            }

            // Replace the old single-column unique on game_id with a composite.
            // Guard each step so a partial previous run does not cause failures.
            $indexNames = collect(Schema::getIndexes('round_drafts'))
                ->pluck('name')
                ->all();

            if (in_array('round_drafts_game_id_unique', $indexNames, true)) {
                // MySQL requires the FK to be dropped before its backing index can be replaced.
                $table->dropForeign(['game_id']);
                $table->dropUnique(['game_id']);
                // Re-add the FK; it will be backed by the composite unique index below.
                $table->foreign('game_id')->references('id')->on('games')->cascadeOnDelete();
            }

            if (! in_array('round_drafts_game_id_round_number_unique', $indexNames, true)) {
                $table->unique(['game_id', 'round_number']);
            }

            if (! in_array('round_drafts_round_number_index', $indexNames, true)) {
                $table->index('round_number');
            }
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void Restores the original single game_id unique constraint.
     * Logic: drop the composite unique and round_number column, then re-add the
     * original unique(game_id) so the schema matches the previous migration state.
     */
    public function down(): void
    {
        Schema::table('round_drafts', function (Blueprint $table): void {
            $table->dropIndex(['round_number']);
            $table->dropUnique(['game_id', 'round_number']);
            $table->dropColumn('round_number');
            $table->unique('game_id');
        });
    }
};
