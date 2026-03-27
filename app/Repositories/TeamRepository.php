<?php

namespace App\Repositories;

use App\Models\Team;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class TeamRepository
{
    /**
     * Create a global team (not bound to a specific game).
     *
     * @param  array<string, mixed>  $attributes  Team attributes including name.
     * @return \App\Models\Team The newly created global team.
     * Logic: persist a team row with only its name; membership in a game is handled
     * separately via the game_team pivot so the same team entity can participate in multiple games.
     */
    public function createTeam(array $attributes): Team
    {
        return Team::query()->create([
            'name' => $attributes['name'],
        ]);
    }

    /**
     * Resolve a team by id globally, throwing 404 if it does not exist.
     *
     * @param  int  $teamId  Identifier of the team.
     * @return \App\Models\Team The matching team model.
     * Logic: perform a primary-key lookup on the teams table and raise a 404-style model
     * exception when missing.
     */
    public function findTeamOrFail(int $teamId): Team
    {
        return Team::query()->findOrFail($teamId);
    }

    /**
     * Resolve a team by id only when it is attached to the provided game.
     *
     * @param  int  $gameId  Identifier of the game.
     * @param  int  $teamId  Identifier of the team.
     * @return \App\Models\Team The matching team model.
     * Logic: verify team existence globally then confirm membership via the game_team pivot
     * to prevent cross-game writes; throws 404 if either check fails.
     */
    public function findTeamInGameOrFail(int $gameId, int $teamId): Team
    {
        $team = Team::query()->findOrFail($teamId);

        $inGame = DB::table('game_team')
            ->where('game_id', $gameId)
            ->where('team_id', $teamId)
            ->exists();

        if (! $inGame) {
            throw new ModelNotFoundException("Team [{$teamId}] is not attached to Game [{$gameId}].");
        }

        return $team;
    }

    /**
     * Find a global team by its normalised, case-insensitive name.
     *
     * @param  string  $name  Name to look up; should already be normalised (trimmed, collapsed spaces).
     * @return \App\Models\Team|null The matching team or null when none exists.
     * Logic: use LOWER() on both sides so 'Team Alpha', 'team alpha', and 'TEAM ALPHA' all resolve
     * to the same record.
     */
    public function findTeamByNameGlobally(string $name): ?Team
    {
        return Team::query()
            ->whereRaw('LOWER(name) = ?', [strtolower($name)])
            ->first();
    }

    /**
     * Determine whether a team is already attached to a given game.
     *
     * @param  int  $gameId  Identifier of the game.
     * @param  int  $teamId  Identifier of the team.
     * @return bool True when a game_team pivot row exists for this pair.
     * Logic: query the game_team pivot for the exact (game_id, team_id) pair.
     */
    public function isTeamAttachedToGame(int $gameId, int $teamId): bool
    {
        return DB::table('game_team')
            ->where('game_id', $gameId)
            ->where('team_id', $teamId)
            ->exists();
    }

    /**
     * Attach an existing team to a game via the game_team pivot.
     *
     * @param  int  $gameId  Identifier of the game.
     * @param  int  $teamId  Identifier of the team.
     * @return void Inserts the pivot row with current_score initialised to zero.
     * Logic: record membership without creating a new team entity; current_score starts at zero
     * for this game regardless of the team's history in other games.
     */
    public function attachTeamToGame(int $gameId, int $teamId): void
    {
        DB::table('game_team')->insertOrIgnore([
            'game_id' => $gameId,
            'team_id' => $teamId,
            'current_score' => 0,
        ]);
    }

    /**
     * Get all teams for a game ordered by team id, with current_score from the game_team pivot.
     *
     * @param  int  $gameId  Identifier of the game.
     * @return \Illuminate\Support\Collection<int, object> Teams for the game with id, name, current_score.
     * Logic: join game_team and teams to return a per-game-scoped collection that includes
     * the current_score stored on the pivot.
     */
    public function getTeamsForGame(int $gameId): Collection
    {
        return DB::table('game_team')
            ->join('teams', 'teams.id', '=', 'game_team.team_id')
            ->where('game_team.game_id', $gameId)
            ->orderBy('teams.id')
            ->get(['teams.id', 'teams.name', 'game_team.current_score']);
    }

    /**
     * Return team ids for a game ordered by ascending team id.
     *
     * @param  int  $gameId  Identifier of the game.
     * @return \Illuminate\Support\Collection<int, int> Ordered team ids.
     * Logic: join game_team and teams to produce a deterministic slot order (slot 0 = lowest id,
     * slot 1 = next lowest id) used for rematch setup and seat assignment.
     */
    public function getOrderedTeamIdsForGame(int $gameId): Collection
    {
        return DB::table('game_team')
            ->join('teams', 'teams.id', '=', 'game_team.team_id')
            ->where('game_team.game_id', $gameId)
            ->orderBy('teams.id')
            ->pluck('teams.id');
    }

    /**
     * Determine whether a game already has exactly two teams assigned.
     *
     * @param  int  $gameId  Identifier of the game.
     * @return bool True when the game has two or more team rows in the pivot, false otherwise.
     * Logic: count game_team rows scoped to the game and return true only when the count reaches two.
     */
    public function gameHasTwoTeams(int $gameId): bool
    {
        return DB::table('game_team')
            ->where('game_id', $gameId)
            ->count() >= 2;
    }

    /**
     * Update a team's name in place.
     *
     * @param  \App\Models\Team  $team  Team model to update.
     * @param  array<string, mixed>  $attributes  Attributes to persist; expects a 'name' key.
     * @return \App\Models\Team The refreshed team after the update.
     * Logic: apply the attribute change and reload the record so callers receive the latest persisted state.
     */
    public function updateTeam(Team $team, array $attributes): Team
    {
        $team->update(['name' => $attributes['name']]);

        return $team->fresh();
    }

    /**
     * Return all teams across all games with their players eager-loaded.
     *
     * @return \Illuminate\Support\Collection<int, \App\Models\Team> All teams ordered from newest to oldest with players loaded.
     * Logic: fetch every team with players pre-loaded to avoid N+1 queries when rendering the team selector.
     */
    public function getAllTeams(): Collection
    {
        return Team::query()
            ->select(['id', 'name'])
            ->with('players')
            ->orderByDesc('id')
            ->get();
    }

    /**
     * Increment and persist a team's running total within a game.
     *
     * @param  int  $gameId  Identifier of the game context.
     * @param  int  $teamId  Identifier of the team.
     * @param  int  $points  Delta to add to the running score.
     * @return object A stdClass row with id, name, and updated current_score from the pivot.
     * Logic: increment current_score on the game_team pivot for the specific (game, team) pair
     * and return a merged row so callers have the updated score for winner resolution.
     */
    public function incrementTeamScore(int $gameId, int $teamId, int $points): object
    {
        DB::table('game_team')
            ->where('game_id', $gameId)
            ->where('team_id', $teamId)
            ->increment('current_score', $points);

        return DB::table('game_team')
            ->join('teams', 'teams.id', '=', 'game_team.team_id')
            ->where('game_team.game_id', $gameId)
            ->where('game_team.team_id', $teamId)
            ->selectRaw('teams.id, teams.name, game_team.current_score')
            ->first();
    }

    /**
     * Recompute a team's total score for a specific game by summing its round_scores rows.
     *
     * @param  int  $gameId  Identifier of the game context.
     * @param  int  $teamId  Identifier of the team.
     * @return int The authoritative cumulative score derived from the round history.
     * Logic: join round_scores through rounds filtered by game_id so only rounds that belong to
     * this game contribute to the total; persist the computed value back to game_team.current_score.
     */
    public function recomputeTeamScoreFromHistory(int $gameId, int $teamId): int
    {
        $total = (int) DB::table('round_scores')
            ->join('rounds', 'rounds.id', '=', 'round_scores.round_id')
            ->where('round_scores.team_id', $teamId)
            ->where('rounds.game_id', $gameId)
            ->sum('round_scores.points');

        DB::table('game_team')
            ->where('game_id', $gameId)
            ->where('team_id', $teamId)
            ->update(['current_score' => $total]);

        return $total;
    }

    /**
     * Recompute and persist current_score for every team in a game from round history.
     *
     * @param  int  $gameId  Identifier of the game whose team scores should be synced.
     * @return void Updates each game_team pivot row so current_score matches the sum of round_scores.
     * Logic: load all team ids for the game from game_team, then delegate each individual
     * recompute to recomputeTeamScoreFromHistory for a single source of truth.
     */
    public function syncTeamScoresForGame(int $gameId): void
    {
        $teamIds = DB::table('game_team')
            ->where('game_id', $gameId)
            ->pluck('team_id');

        foreach ($teamIds as $teamId) {
            $this->recomputeTeamScoreFromHistory($gameId, (int) $teamId);
        }
    }
}
