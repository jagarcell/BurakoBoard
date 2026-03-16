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
     * @return void Creates the game_team pivot table, migrates existing data, then restructures the teams table.
     * Logic:
     *   1. Create game_team (game_id, team_id, current_score) and populate it from teams.game_id / teams.current_score
     *      using insertOrIgnore (cross-database) to skip rows already copied by a prior partial run.
     *   2. Drop the game_id FK and current_score column from teams, making teams a global entity.
     *   3. Drop the (game_id, name) composite unique index and add a plain unique index on teams.name
     *      so team names are globally unique (case-insensitive uniqueness is enforced at the application layer
     *      via normalized LOWER() comparison; the DB index prevents raw duplicates).
     */
    public function up(): void
    {
        // Guard: game_team may already exist if a previous run failed midway.
        if (! Schema::hasTable('game_team')) {
            Schema::create('game_team', function (Blueprint $table): void {
                $table->foreignId('game_id')->constrained('games')->cascadeOnDelete();
                $table->foreignId('team_id')->constrained('teams')->cascadeOnDelete();
                $table->integer('current_score')->default(0);
                $table->primary(['game_id', 'team_id']);
                $table->index('team_id');
            });
        }

        // Only migrate data and restructure teams if game_id column is still present.
        if (Schema::hasColumn('teams', 'game_id')) {
            // Migrate existing per-game team data into the pivot before removing those columns.
            // insertOrIgnore is cross-database (MySQL, SQLite) and silently skips duplicate pivot rows
            // that may have been written by a previous partial run.
            DB::table('teams')
                ->whereNotNull('game_id')
                ->orderBy('id')
                ->select(['game_id', 'id', 'current_score'])
                ->each(function (object $team): void {
                    DB::table('game_team')->insertOrIgnore([
                        'game_id'       => $team->game_id,
                        'team_id'       => $team->id,
                        'current_score' => $team->current_score,
                    ]);
                });

            // Drop FK first (MySQL requires this before dropping the index it backs),
            // then drop the composite unique index, then remove the columns.
            Schema::table('teams', function (Blueprint $table): void {
                $table->dropForeign(['game_id']);
                $table->dropUnique(['game_id', 'name']);
                $table->dropColumn(['game_id', 'current_score']);
            });
        }

        // Add a global unique index on name only if it does not already exist.
        // First deduplicate: teams were per-game before this migration, so the same name
        // may exist across multiple games. For each duplicate group keep the lowest id as
        // the canonical team; redirect all FK references then delete the superseded rows.
        $duplicateNames = DB::table('teams')
            ->select('name')
            ->groupBy('name')
            ->havingRaw('COUNT(*) > 1')
            ->pluck('name');

        foreach ($duplicateNames as $name) {
            $ids = DB::table('teams')
                ->where('name', $name)
                ->orderBy('id')
                ->pluck('id');

            $canonicalId = $ids->shift(); // lowest id is kept

            foreach ($ids as $staleId) {
                // game_team: find games where both canonical and stale are present.
                $conflictingGameIds = DB::table('game_team as stale')
                    ->join('game_team as canon', function ($join) use ($canonicalId): void {
                        $join->on('stale.game_id', '=', 'canon.game_id')
                             ->where('canon.team_id', '=', $canonicalId);
                    })
                    ->where('stale.team_id', $staleId)
                    ->pluck('stale.game_id');

                // Merge current_score from conflicting stale rows into canonical rows.
                foreach ($conflictingGameIds as $gameId) {
                    $staleScore = (int) DB::table('game_team')
                        ->where('game_id', $gameId)
                        ->where('team_id', $staleId)
                        ->value('current_score');

                    if ($staleScore !== 0) {
                        DB::table('game_team')
                            ->where('game_id', $gameId)
                            ->where('team_id', $canonicalId)
                            ->increment('current_score', $staleScore);
                    }
                }

                // Remove conflicting stale rows, then move the rest to canonical.
                DB::table('game_team')
                    ->where('team_id', $staleId)
                    ->whereIn('game_id', $conflictingGameIds->all())
                    ->delete();

                DB::table('game_team')
                    ->where('team_id', $staleId)
                    ->update(['team_id' => $canonicalId]);

                // round_scores: redirect to canonical.
                DB::table('round_scores')
                    ->where('team_id', $staleId)
                    ->update(['team_id' => $canonicalId]);

                // team_player: drop players already on canonical to avoid PK collision, then move the rest.
                $existingPlayerIds = DB::table('team_player')
                    ->where('team_id', $canonicalId)
                    ->pluck('player_id');

                DB::table('team_player')
                    ->where('team_id', $staleId)
                    ->whereIn('player_id', $existingPlayerIds->all())
                    ->delete();

                DB::table('team_player')
                    ->where('team_id', $staleId)
                    ->update(['team_id' => $canonicalId]);

                // games.winning_team_id: redirect to canonical.
                DB::table('games')
                    ->where('winning_team_id', $staleId)
                    ->update(['winning_team_id' => $canonicalId]);

                DB::table('teams')->where('id', $staleId)->delete();
            }
        }

        $hasNameUnique = collect(Schema::getIndexes('teams'))->contains(
            fn (array $index) => $index['name'] === 'teams_name_unique',
        );

        if (! $hasNameUnique) {
            // Add a global unique index on name. Case-insensitive uniqueness is enforced via
            // application-level LOWER() comparison in StoreTeamRequest.
            Schema::table('teams', function (Blueprint $table): void {
                $table->unique('name');
            });
        }
    }

    /**
     * Reverse the migrations.
     *
     * @return void Restores game_id and current_score on teams, removes game_team.
     * Logic: re-add the columns to teams, then iterate the pivot to copy each row back using
     *        cross-database query builder updates (avoids MySQL-specific JOIN syntax),
     *        and finally drop the pivot table.
     */
    public function down(): void
    {
        Schema::table('teams', function (Blueprint $table): void {
            $table->dropUnique(['name']);
            $table->foreignId('game_id')->nullable()->after('id')->constrained('games')->cascadeOnDelete();
            $table->integer('current_score')->default(0)->after('name');
        });

        // Restore data from the pivot back to teams using cross-database query builder updates.
        DB::table('game_team')
            ->orderBy('team_id')
            ->select(['game_id', 'team_id', 'current_score'])
            ->each(function (object $pivot): void {
                DB::table('teams')->where('id', $pivot->team_id)->update([
                    'game_id'       => $pivot->game_id,
                    'current_score' => $pivot->current_score,
                ]);
            });

        Schema::dropIfExists('game_team');
    }
};
