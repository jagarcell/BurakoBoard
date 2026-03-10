<?php

namespace App\Repositories;

use App\Models\Game;
use App\Models\Player;
use App\Models\Round;
use App\Models\RoundScore;
use App\Models\Team;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class BurakoGameRepository
{
    /**
     * Persist a new game record.
     *
     * @param  array<string, mixed>  $attributes  Game attributes including name and target points.
     * @return \App\Models\Game The newly created game.
     * Logic: issue one create operation on the games model and return the hydrated record.
     */
    public function createGame(array $attributes): Game
    {
        return Game::query()->create($attributes);
    }

    /**
     * Resolve a game by id or fail.
     *
     * @param  int  $gameId  Identifier of the game.
     * @return \App\Models\Game The matching game model.
     * Logic: perform a primary-key lookup and raise a 404-style model exception when missing.
     */
    public function findGameOrFail(int $gameId): Game
    {
        return Game::query()->findOrFail($gameId);
    }

    /**
     * Return the existing games for dashboard selection.
     *
     * @return \Illuminate\Support\Collection<int, \App\Models\Game> Existing games ordered from newest to oldest.
     * Logic: fetch a lightweight ordered game list so the dashboard selector can render choices without assembling full score history payloads.
     */
    public function getGameList(): Collection
    {
        return Game::query()
            ->select([
                'id',
                'name',
                'target_points',
                'status',
                'winning_team_id',
                'current_round_number',
            ])
            ->orderByDesc('id')
            ->get();
    }

    /**
     * Create a team under a given game.
     *
     * @param  int  $gameId  Identifier of the parent game.
     * @param  array<string, mixed>  $attributes  Team attributes including name.
     * @return \App\Models\Team The newly created team.
     * Logic: persist a game-bound team with initial running score set to zero.
     */
    public function createTeam(int $gameId, array $attributes): Team
    {
        return Team::query()->create([
            'game_id' => $gameId,
            'name' => $attributes['name'],
            'current_score' => 0,
        ]);
    }

    /**
     * Resolve a team by id only when it belongs to the provided game.
     *
     * @param  int  $gameId  Identifier of the game.
     * @param  int  $teamId  Identifier of the team.
     * @return \App\Models\Team The matching team model.
     * Logic: constrain by both team id and game id to prevent cross-game writes.
     */
    public function findTeamInGameOrFail(int $gameId, int $teamId): Team
    {
        return Team::query()
            ->where('id', $teamId)
            ->where('game_id', $gameId)
            ->firstOrFail();
    }

    /**
     * Create a standalone named player not linked to a user account.
     *
     * @param  string  $name  Display name for the player.
     * @return \App\Models\Player The created player model.
     * Logic: persist a player row with null user_id for guests/non-registered participants.
     */
    public function createNamedPlayer(string $name): Player
    {
        return Player::query()->create([
            'user_id' => null,
            'display_name' => $name,
        ]);
    }

    /**
     * Resolve or create a player mapped to a registered user.
     *
     * @param  int  $userId  Identifier of the user account.
     * @param  string  $fallbackName  Name to store when creating the player record.
     * @return \App\Models\Player The existing or newly created player.
     * Logic: reuse the same player identity per user_id, creating it only once when first referenced.
     */
    public function findOrCreatePlayerFromUser(int $userId, string $fallbackName): Player
    {
        return Player::query()->firstOrCreate(
            ['user_id' => $userId],
            ['display_name' => $fallbackName]
        );
    }

    /**
     * Assign a player to a team only once.
     *
     * @param  int  $teamId  Identifier of the team.
     * @param  int  $playerId  Identifier of the player.
     * @return void Creates a team-player relation if missing.
     * Logic: perform idempotent pivot write so duplicate add-player calls do not create duplicate memberships.
     */
    public function attachPlayerToTeam(int $teamId, int $playerId): void
    {
        DB::table('team_player')->updateOrInsert(
            ['team_id' => $teamId, 'player_id' => $playerId],
            ['updated_at' => now(), 'created_at' => now()]
        );
    }

    /**
     * Get all teams for a game ordered by id.
     *
     * @param  int  $gameId  Identifier of the game.
     * @return \Illuminate\Support\Collection<int, \App\Models\Team> Teams for the game.
     * Logic: return deterministic ordering used by score validation and response rendering.
     */
    public function getTeamsForGame(int $gameId): Collection
    {
        return Team::query()
            ->where('game_id', $gameId)
            ->orderBy('id')
            ->get();
    }

    /**
     * Calculate the next round number for a game.
     *
     * @param  int  $gameId  Identifier of the game.
     * @return int The next round number.
     * Logic: read current max round_number for the game and increment by one.
     */
    public function getNextRoundNumber(int $gameId): int
    {
        $maxRound = Round::query()
            ->where('game_id', $gameId)
            ->max('round_number');

        return (int) $maxRound + 1;
    }

    /**
     * Create a round record for a game.
     *
     * @param  int  $gameId  Identifier of the game.
     * @param  int  $roundNumber  Sequential round number.
     * @return \App\Models\Round The created round model.
     * Logic: persist one round header row that groups all team scores for the turn.
     */
    public function createRound(int $gameId, int $roundNumber): Round
    {
        return Round::query()->create([
            'game_id' => $gameId,
            'round_number' => $roundNumber,
        ]);
    }

    /**
     * Persist a score entry for one team inside a round.
     *
     * @param  int  $roundId  Identifier of the round.
     * @param  int  $teamId  Identifier of the team.
     * @param  int  $points  Points scored in this round.
     * @return \App\Models\RoundScore The created round score model.
     * Logic: create one round_scores record linking a team and points to the parent round.
     */
    public function createRoundScore(int $roundId, int $teamId, int $points): RoundScore
    {
        return RoundScore::query()->create([
            'round_id' => $roundId,
            'team_id' => $teamId,
            'points' => $points,
        ]);
    }

    /**
     * Increment and persist a team's running total.
     *
     * @param  \App\Models\Team  $team  Team to update.
     * @param  int  $points  Delta to add to the running score.
     * @return \App\Models\Team The updated team.
     * Logic: mutate current_score with the round delta and save immediately.
     */
    public function incrementTeamScore(Team $team, int $points): Team
    {
        $team->current_score += $points;
        $team->save();

        return $team;
    }

    /**
     * Recompute a team's total score by summing all its round_scores rows scoped to the team's game.
     *
     * @param  int  $teamId  Identifier of the team.
     * @return int The authoritative cumulative score derived from the round history.
     * Logic: join round_scores through rounds and filter by the team's own game_id so only rounds that belong to this team's game contribute to the total, then persist the computed value back to teams.current_score.
     */
    public function recomputeTeamScoreFromHistory(int $teamId): int
    {
        $team = Team::query()->findOrFail($teamId);

        $total = (int) DB::table('round_scores')
            ->join('rounds', 'rounds.id', '=', 'round_scores.round_id')
            ->where('round_scores.team_id', $teamId)
            ->where('rounds.game_id', $team->game_id)
            ->sum('round_scores.points');

        Team::query()->where('id', $teamId)->update(['current_score' => $total]);

        return $total;
    }

    /**
     * Recompute and persist current_score for every team in a game from round history.
     *
     * @param  int  $gameId  Identifier of the game whose team scores should be synced.
     * @return void Updates each team row in place so current_score matches the sum of round_scores.
     * Logic: load all team ids for the game, then delegate each individual recompute to recomputeTeamScoreFromHistory for a single source of truth.
     */
    public function syncTeamScoresForGame(int $gameId): void
    {
        $teamIds = Team::query()
            ->where('game_id', $gameId)
            ->pluck('id');

        foreach ($teamIds as $teamId) {
            $this->recomputeTeamScoreFromHistory((int) $teamId);
        }
    }

    /**
     * Mark a game as finished with a winner and round number.
     *
     * @param  \App\Models\Game  $game  Game to update.
     * @param  int  $winningTeamId  Identifier of the winning team.
     * @param  int  $roundNumber  Last played round number.
     * @return \App\Models\Game The updated game model.
     * Logic: set terminal state fields atomically on the game row after winner resolution.
     */
    public function finishGameWithWinner(Game $game, int $winningTeamId, int $roundNumber): Game
    {
        $game->status = 'finished';
        $game->winning_team_id = $winningTeamId;
        $game->current_round_number = $roundNumber;
        $game->save();

        return $game;
    }

    /**
     * Update an existing game's name and target points.
     *
     * @param  int  $gameId  Identifier of the game to update.
     * @param  array<string, mixed>  $attributes  Attributes to persist on the game record.
     * @return \App\Models\Game The updated game model with refreshed attributes.
     * Logic: resolve the game or throw 404, apply the attribute update, and return the freshly loaded record.
     */
    public function updateGame(int $gameId, array $attributes): Game
    {
        $game = $this->findGameOrFail($gameId);
        $game->update($attributes);

        return $game->fresh();
    }

    /**
     * Update only the game's current round counter.
     *
     * @param  \App\Models\Game  $game  Game to update.
     * @param  int  $roundNumber  Latest completed round.
     * @return \App\Models\Game The updated game model.
     * Logic: persist the latest completed round when no winner is reached yet.
     */
    public function updateGameRoundCounter(Game $game, int $roundNumber): Game
    {
        $game->current_round_number = $roundNumber;
        $game->save();

        return $game;
    }

    /**
     * Return all registered users ordered by name for player selection.
     *
     * @return \Illuminate\Support\Collection<int, \App\Models\User> Users ordered alphabetically by name.
     * Logic: fetch a minimal id-and-name user list so team creation dialogs can present registered player candidates without loading full profile data.
     */
    public function getUserList(): Collection
    {
        return User::query()
            ->select(['id', 'name'])
            ->orderBy('name')
            ->get();
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
            ->with('players')
            ->orderByDesc('id')
            ->get();
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
     * Build a full game summary including teams, players, and round history.
     *
     * @param  int  $gameId  Identifier of the game.
     * @return array<string, mixed> Structured summary payload for API output.
     * Logic: compose a read model by joining team memberships and round scores, then map them into API resource structure.
     */
    public function getGameSummary(int $gameId): array
    {
        $game = $this->findGameOrFail($gameId);

        $teams = DB::table('teams')
            ->where('game_id', $gameId)
            ->orderBy('id')
            ->get();

        $playersByTeam = DB::table('team_player')
            ->join('players', 'players.id', '=', 'team_player.player_id')
            ->whereIn('team_player.team_id', $teams->pluck('id')->all())
            ->orderBy('players.id')
            ->get([
                'team_player.team_id',
                'players.id as player_id',
                'players.user_id',
                'players.display_name',
            ])
            ->groupBy('team_id');

        $roundRows = DB::table('round_scores')
            ->join('rounds', 'rounds.id', '=', 'round_scores.round_id')
            ->join('teams', 'teams.id', '=', 'round_scores.team_id')
            ->where('rounds.game_id', $gameId)
            ->orderBy('rounds.round_number')
            ->orderBy('teams.id')
            ->get([
                'rounds.round_number',
                'round_scores.team_id',
                'teams.name as team_name',
                'round_scores.points',
            ]);

        $rounds = $roundRows
            ->groupBy('round_number')
            ->map(function (Collection $scores, int|string $roundNumber): array {
                return [
                    'round_number' => (int) $roundNumber,
                    'scores' => $scores->map(fn ($score): array => [
                        'team_id' => (int) $score->team_id,
                        'team_name' => $score->team_name,
                        'points' => (int) $score->points,
                    ])->values()->all(),
                ];
            })
            ->values()
            ->all();

        $teamPayload = $teams->map(function ($team) use ($playersByTeam): array {
            $teamPlayers = $playersByTeam->get($team->id, collect())
                ->map(fn ($player): array => [
                    'id' => (int) $player->player_id,
                    'user_id' => $player->user_id === null ? null : (int) $player->user_id,
                    'display_name' => $player->display_name,
                ])
                ->values()
                ->all();

            return [
                'id' => (int) $team->id,
                'name' => $team->name,
                'current_score' => (int) $team->current_score,
                'players' => $teamPlayers,
            ];
        })->values()->all();

        return [
            'game' => [
                'id' => $game->id,
                'name' => $game->name,
                'target_points' => $game->target_points,
                'status' => $game->status,
                'winning_team_id' => $game->winning_team_id,
                'current_round_number' => $game->current_round_number,
            ],
            'teams' => $teamPayload,
            'rounds' => $rounds,
        ];
    }
}
