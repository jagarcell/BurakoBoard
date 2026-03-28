<?php

namespace App\Services;

use App\Enums\GameStatus;
use App\Enums\GameUserRole;
use App\Http\Resources\Api\V1\GameSummaryResource;
use App\Models\Game;
use App\Repositories\GameRepository;
use App\Repositories\SeatRepository;
use App\Repositories\TeamRepository;
use Illuminate\Database\QueryException;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;

class GameService
{
    /**
     * Construct the service with game-lifecycle repository dependencies.
     *
     * @param  \App\Repositories\GameRepository  $gameRepository  Handles game CRUD and game_user pivot.
     * @param  \App\Repositories\TeamRepository  $teamRepository  Handles team lookups needed by createRematch and gameHasTwoTeams.
     * @param  \App\Repositories\SeatRepository  $seatRepository  Handles seat copy operations in createRematch.
     * @return void
     * Logic: inject only the repositories required for game lifecycle concerns owned by this service.
     */
    public function __construct(
        private readonly GameRepository $gameRepository,
        private readonly TeamRepository $teamRepository,
        private readonly SeatRepository $seatRepository,
    ) {
    }

    /**
     * Return the games linked to a specific user for dashboard selection.
     *
     * @param  int  $userId  Identifier of the authenticated user requesting the list.
     * @return \Illuminate\Support\Collection<int, \App\Models\Game> Games the user has access to, ordered for selector display.
     * Logic: delegate the user-scoped game listing query to the repository so the dashboard
     *   can populate its selector with only the games the current user is enrolled in.
     */
    public function listGames(int $userId): Collection
    {
        return $this->gameRepository->getGameList($userId);
    }

    /**
     * Create a new game in progress and enrol the creator in the game_user pivot.
     *
     * @param  array<string, mixed>  $payload  Validated game data with name and target points.
     * @param  int  $userId  Identifier of the authenticated user creating the game.
     * @return array<string, mixed> Game summary payload.
     * Logic: persist the game record, attach the creating user with the 'creator' role so the
     *   game appears in their filtered dashboard list, then return the full summary payload.
     */
    public function createGame(array $payload, int $userId): array
    {
        $game = $this->gameRepository->createGame([
            'name'                         => $payload['name'],
            'target_points'                => (int) $payload['target_points'],
            'status'                       => GameStatus::InProgress,
            'winning_team_id'              => null,
            'current_round_number'         => 0,
            'initial_shuffler_seat_number' => null,
        ]);

        $this->gameRepository->attachUserToGame($game->id, $userId, GameUserRole::Creator->value);

        Log::info('Game created', ['game_id' => $game->id, 'creator_id' => $userId]);

        return (new GameSummaryResource($this->gameRepository->getGameSummary($game->id)))->resolve();
    }

    /**
     * Update an existing game's name and target points.
     *
     * @param  int  $gameId  Identifier of the game to update.
     * @param  array<string, mixed>  $payload  Validated data with new name and target_points.
     * @return \App\Models\Game The updated game model.
     * Logic: forward the sanitized payload to the repository and return the refreshed model for caller serialization.
     */
    public function updateGame(int $gameId, array $payload): Game
    {
        return $this->gameRepository->updateGame($gameId, [
            'name'          => $payload['name'],
            'target_points' => (int) $payload['target_points'],
        ]);
    }

    /**
     * Return all available base scoring elements.
     *
     * @return \Illuminate\Support\Collection<int, \App\Models\BaseElement> All base elements ordered by id.
     * Logic: delegate the base element retrieval to the repository so the controller can obtain
     *   the scoring catalogue without direct query coupling.
     */
    public function listBaseElements(): Collection
    {
        return $this->gameRepository->getBaseElements();
    }

    /**
     * Return the latest scoreboard and round history for a game.
     *
     * @param  int  $gameId  Identifier of the game.
     * @return array<string, mixed> Full game summary payload.
     * Logic: delegate read-model assembly to the repository to provide one consistent API response shape.
     */
    public function getGameSummary(int $gameId): array
    {
        return (new GameSummaryResource($this->gameRepository->getGameSummary($gameId)))->resolve();
    }

    /**
     * Determine whether a game has two teams assigned.
     *
     * @param  int  $gameId  Identifier of the game.
     * @return bool True when the game already has two teams, false otherwise.
     * Logic: verify the game exists (throws 404 if missing), then delegate the team count check to the repository.
     */
    public function gameHasTwoTeams(int $gameId): bool
    {
        $this->gameRepository->findGameOrFail($gameId);

        return $this->teamRepository->gameHasTwoTeams($gameId);
    }

    /**
     * Delete a game that has no recorded rounds, enforcing creator-only access.
     *
     * @param  int  $gameId  Identifier of the game to delete.
     * @param  int  $userId  Identifier of the authenticated user requesting the deletion.
     * @return void
     * Logic:
     *   1. Resolve the game or fail with 404.
     *   2. Verify the requesting user is the creator via the game_user pivot; abort 403 if not.
     *   3. Guard against deletion when rounds have already been recorded; throw a validation
     *      exception so the HTTP layer converts it to a 422 with a descriptive message.
     *   4. Delegate the permanent removal to the repository, relying on DB cascade for related rows.
     */
    public function deleteGame(int $gameId, int $userId): void
    {
        $this->gameRepository->findGameOrFail($gameId);

        if (! $this->gameRepository->isGameCreator($gameId, $userId)) {
            abort(403, 'Only the game creator can delete this game.');
        }

        if ($this->gameRepository->gameHasRounds($gameId)) {
            throw ValidationException::withMessages([
                'game' => ['This game cannot be deleted because it already has recorded rounds.'],
            ]);
        }

        $this->gameRepository->deleteGame($gameId);

        Log::info('Game deleted', ['game_id' => $gameId, 'deleted_by' => $userId]);
    }

    /**
     * Create a new game as a rematch of an existing finished game.
     *
     * @param  int  $sourceGameId  Identifier of the finished game being rematched.
     * @param  array<string, mixed>  $payload  Validated payload containing name and target_points.
     * @param  int  $userId  Identifier of the authenticated creator.
     * @return array<string, mixed> Game summary payload for the newly created rematch game.
     * Logic:
     *  1. Load the source game and abort with a validation error if it is still in progress.
     *  2. Restrict rematch creation to the game's creator.
     *  3. Within a DB transaction: create the new game, attach the creator, attach the same teams
     *     from the source game (preserving team order), copy seat assignments from the source game,
     *     and set the initial shuffler seat to the player who would be cutter in the next rotation
     *     so the player order carries over correctly.
     *  4. Return the full summary payload.
     */
    public function createRematch(int $sourceGameId, array $payload, int $userId): array
    {
        $sourceGame = $this->gameRepository->findGameOrFail($sourceGameId);

        if ($sourceGame->status !== GameStatus::Finished) {
            throw ValidationException::withMessages([
                'game' => 'Only finished games can be rematched.',
            ]);
        }

        if (! $this->gameRepository->isGameCreator($sourceGameId, $userId)) {
            abort(403, 'Only the game creator can start a rematch.');
        }

        try {
            $newGameId = DB::transaction(function () use ($sourceGameId, $sourceGame, $payload, $userId): int {
                $newGame = $this->gameRepository->createGame([
                    'name'                         => $payload['name'],
                    'target_points'                => (int) $payload['target_points'],
                    'status'                       => GameStatus::InProgress,
                    'winning_team_id'              => null,
                    'current_round_number'         => 0,
                    'initial_shuffler_seat_number' => null,
                ]);

                $this->gameRepository->attachUserToGame($newGame->id, $userId, GameUserRole::Creator->value);

                $teamIds = $this->teamRepository->getOrderedTeamIdsForGame($sourceGameId);

                foreach ($teamIds as $teamId) {
                    $this->teamRepository->attachTeamToGame($newGame->id, (int) $teamId);
                }

                $this->seatRepository->copySeatsFromGame($sourceGameId, $newGame->id);

                $nextCutterSeat = $this->seatRepository->computeNextCutterSeatNumber($sourceGame);

                if ($nextCutterSeat !== null) {
                    $this->gameRepository->updateGameInitialShufflerSeat($newGame, $nextCutterSeat);
                }

                return $newGame->id;
            });
        } catch (QueryException $e) {
            Log::error('DB transaction failed in createRematch', [
                'source_game_id' => $sourceGameId,
                'sql'            => $e->getSql(),
                'bindings'       => $e->getBindings(),
                'message'        => $e->getMessage(),
                'user_id'        => $userId,
            ]);
            throw ValidationException::withMessages([
                'game' => ['The rematch could not be created due to a database error. Please try again.'],
            ]);
        }

        return (new GameSummaryResource($this->gameRepository->getGameSummary($newGameId)))->resolve();
    }
}
