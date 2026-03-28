<?php

namespace App\Services;

use App\Enums\GameStatus;
use App\Events\GameUpdated;
use App\Http\Resources\Api\V1\GameSummaryResource;
use App\Models\Player;
use App\Repositories\GameRepository;
use App\Repositories\PlayerRepository;
use App\Repositories\SeatRepository;
use App\Repositories\TeamRepository;
use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;

class PlayerService
{
    /**
     * Construct the service with player-management repository dependencies.
     *
     * @param  \App\Repositories\GameRepository   $gameRepository   Needed for game status guards and summary broadcast.
     * @param  \App\Repositories\TeamRepository   $teamRepository   Handles team membership look-ups.
     * @param  \App\Repositories\PlayerRepository $playerRepository Handles player CRUD and team_player pivot.
     * @param  \App\Repositories\SeatRepository   $seatRepository   Handles seat assignment and swap operations.
     * @return void
     * Logic: inject only the repositories required for player-management concerns owned by this service.
     */
    public function __construct(
        private readonly GameRepository $gameRepository,
        private readonly TeamRepository $teamRepository,
        private readonly PlayerRepository $playerRepository,
        private readonly SeatRepository $seatRepository,
    ) {
    }

    /**
     * Return all registered users available for player assignment.
     *
     * @return \Illuminate\Support\Collection<int, \App\Models\User> Registered users ordered by name.
     * Logic: delegate user list retrieval to the repository so the team creation dialog has a
     *   stable source of registered player candidates.
     */
    public function listUsers(): Collection
    {
        return $this->playerRepository->getUserList();
    }

    /**
     * Add a player to a team either by free-form name or by registered user id.
     *
     * @param  int  $gameId  Identifier of the game.
     * @param  int  $teamId  Identifier of the team.
     * @param  array<string, mixed>  $payload  Validated player input.
     * @return array<string, mixed> Game summary payload after player assignment.
     * Logic: block writes on finished games, reject duplicate player names within the team using a
     *   case-insensitive normalised comparison, resolve player source (name or user), attach once
     *   to the team and assign a seat, then broadcast and return the updated summary.
     */
    public function addPlayerToTeam(int $gameId, int $teamId, array $payload): array
    {
        $game = $this->gameRepository->findGameOrFail($gameId);

        if ($game->status !== GameStatus::InProgress) {
            throw ValidationException::withMessages([
                'game' => 'Cannot add players to a finished game.',
            ]);
        }

        $team = $this->teamRepository->findTeamInGameOrFail($gameId, $teamId);

        $incomingName = $payload['name'] ?? null;

        if ($incomingName !== null && $this->playerRepository->teamHasPlayerWithName($team->id, $incomingName)) {
            throw ValidationException::withMessages([
                'name' => 'A player with this name already exists in this team.',
            ]);
        }

        $player = $this->resolvePlayerForPayload($payload);

        $this->playerRepository->attachPlayerToTeam($team->id, $player->id);
        $this->seatRepository->assignPlayerSeat($gameId, $team->id, $player->id);

        return $this->broadcastAndReturn($gameId);
    }

    /**
     * Remove a player from a team within a game.
     *
     * @param  int  $gameId    Identifier of the game.
     * @param  int  $teamId    Identifier of the team.
     * @param  int  $playerId  Identifier of the player to remove.
     * @return array<string, mixed> Game summary payload after the player is removed.
     * Logic: block removal on finished games, verify the team belongs to the game,
     *   detach the seat row and the team_player pivot row, then broadcast and return the updated summary.
     */
    public function removePlayerFromTeam(int $gameId, int $teamId, int $playerId): array
    {
        $game = $this->gameRepository->findGameOrFail($gameId);

        if ($game->status !== GameStatus::InProgress) {
            throw ValidationException::withMessages([
                'game' => 'Cannot remove players from a finished game.',
            ]);
        }

        $this->teamRepository->findTeamInGameOrFail($gameId, $teamId);

        $this->seatRepository->removePlayerSeatForTeam($teamId, $playerId);
        $this->playerRepository->detachPlayerFromTeam($teamId, $playerId);

        return $this->broadcastAndReturn($gameId);
    }

    /**
     * Swap the seat numbers of two players within a game.
     *
     * @param  int  $gameId     Identifier of the game in which the swap takes place.
     * @param  int  $playerIdA  Identifier of the first player.
     * @param  int  $playerIdB  Identifier of the second player.
     * @return array<string, mixed> Updated game summary payload after the swap.
     * Logic: enforce that the game is still in progress, then delegate the atomic seat exchange
     *   to the repository and broadcast and return the refreshed summary.
     */
    public function swapPlayerSeats(int $gameId, int $playerIdA, int $playerIdB): array
    {
        $game = $this->gameRepository->findGameOrFail($gameId);

        if ($game->status !== GameStatus::InProgress) {
            throw ValidationException::withMessages([
                'game' => 'Cannot swap seats in a finished game.',
            ]);
        }

        $this->seatRepository->swapPlayerSeats($gameId, $playerIdA, $playerIdB);

        return $this->broadcastAndReturn($gameId);
    }

    /**
     * Build a player model from payload rules.
     *
     * @param  array<string, mixed>  $payload  Validated player payload containing either user_id or name.
     * @return \App\Models\Player The resolved player model.
     * Logic: reuse existing player record for registered users, otherwise create an ad-hoc named
     *   player entry so display-name players are persisted without a user account.
     */
    private function resolvePlayerForPayload(array $payload): Player
    {
        $userId = $payload['user_id'] ?? null;

        if ($userId !== null) {
            return $this->playerRepository->findOrCreatePlayerFromUser(
                (int) $userId,
                (string) ($payload['name'] ?? 'Registered Player')
            );
        }

        return $this->playerRepository->createNamedPlayer((string) $payload['name']);
    }

    /**
     * Assemble the authoritative summary, broadcast it to other channel members, and return it.
     *
     * @param  int  $gameId  Identifier of the game that was mutated.
     * @return array<string, mixed> The refreshed game summary.
     * Logic: assemble the authoritative summary once, dispatch a GameUpdated event to every
     *   other authenticated member of the private game channel so their UI reflects the change
     *   without requiring a page reload, then return the summary to the HTTP layer.
     */
    private function broadcastAndReturn(int $gameId): array
    {
        $data = $this->gameRepository->getGameSummary($gameId);
        $summary = (new GameSummaryResource($data))->resolve();

        broadcast(new GameUpdated($gameId, $summary))->toOthers();

        return $summary;
    }
}
