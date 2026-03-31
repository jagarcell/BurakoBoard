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
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;

class TeamService
{
    /**
     * Construct the service with team-management repository dependencies.
     *
     * @param  \App\Repositories\GameRepository    $gameRepository    Needed for game status guards and summary broadcast.
     * @param  \App\Repositories\TeamRepository    $teamRepository    Handles team CRUD and game_team pivot.
     * @param  \App\Repositories\SeatRepository    $seatRepository    Handles seat reassignment when teams are attached.
     * @param  \App\Repositories\PlayerRepository  $playerRepository  Handles player resolution and team_player pivot writes.
     * @return void
     * Logic: inject only the repositories required for team-management concerns owned by this service.
     */
    public function __construct(
        private readonly GameRepository $gameRepository,
        private readonly TeamRepository $teamRepository,
        private readonly SeatRepository $seatRepository,
        private readonly PlayerRepository $playerRepository,
    ) {
    }

    /**
     * Return all teams with their players for the team selector.
     *
     * @return \Illuminate\Support\Collection<int, \App\Models\Team> All teams with players loaded.
     * Logic: delegate the all-teams query to the repository so the frontend team selector can
     *   present previously used teams.
     */
    public function listTeams(): Collection
    {
        return $this->teamRepository->getAllTeams();
    }

    /**
     * Add a new team to an existing game.
     *
     * @param  int  $gameId  Identifier of the game.
     * @param  array<string, mixed>  $payload  Validated team data.
     * @return array<string, mixed> Game summary payload after team creation.
     * Logic: enforce that only in-progress games can receive teams, create the global team record,
     *   attach it to the game via the pivot, then broadcast and return the refreshed summary.
     */
    public function addTeam(int $gameId, array $payload): array
    {
        $game = $this->gameRepository->findGameOrFail($gameId);

        if ($game->status !== GameStatus::InProgress) {
            throw ValidationException::withMessages([
                'game' => 'Cannot add teams to a finished game.',
            ]);
        }

        $team = $this->teamRepository->createTeam([
            'name' => $payload['name'],
        ]);

        $this->teamRepository->attachTeamToGame($gameId, $team->id);

        return $this->broadcastAndReturn($gameId);
    }

    /**
     * Attach an existing global team to a game without creating a new team entity.
     *
     * @param  int  $gameId  Identifier of the game.
     * @param  int  $teamId  Identifier of the existing team to attach.
     * @return array<string, mixed> Game summary payload after attaching the team.
     * Logic: enforce in-progress guard, verify the team exists globally, reject if already attached
     *   to this game to prevent duplicate pivot rows, insert the pivot row, then reassign all seats
     *   so that team ordering and seat numbers remain consistent.
     */
    public function attachExistingTeam(int $gameId, int $teamId): array
    {
        $game = $this->gameRepository->findGameOrFail($gameId);

        if ($game->status !== GameStatus::InProgress) {
            throw ValidationException::withMessages([
                'game' => 'Cannot add teams to a finished game.',
            ]);
        }

        $team = $this->teamRepository->findTeamOrFail($teamId);

        $alreadyAttached = $this->teamRepository->isTeamAttachedToGame($gameId, $team->id);

        if ($alreadyAttached) {
            throw ValidationException::withMessages([
                'team' => 'This team is already part of this game.',
            ]);
        }

        $this->teamRepository->attachTeamToGame($gameId, $team->id);

        // Reassign all seats from scratch so that a team with a lower id added after
        // a team with a higher id gets the correct odd-slot seats, and the existing
        // team's players are moved to the even slot where required.
        $this->seatRepository->reassignAllSeatsForGame($gameId);

        return $this->broadcastAndReturn($gameId);
    }

    /**
     * Update the name of an existing team within a game.
     *
     * @param  int  $gameId  Identifier of the game owning the team.
     * @param  int  $teamId  Identifier of the team to update.
     * @param  array<string, mixed>  $payload  Validated team data containing the new name.
     * @return array<string, mixed> Game summary payload after the update.
     * Logic: enforce game status, resolve the team within the game, update its name,
     *   then broadcast and return the refreshed summary.
     */
    public function updateTeam(int $gameId, int $teamId, array $payload): array
    {
        $game = $this->gameRepository->findGameOrFail($gameId);

        if ($game->status !== GameStatus::InProgress) {
            throw ValidationException::withMessages([
                'game' => 'Cannot update teams in a finished game.',
            ]);
        }

        $team = $this->teamRepository->findTeamInGameOrFail($gameId, $teamId);
        $this->teamRepository->updateTeam($team, $payload);

        return $this->broadcastAndReturn($gameId);
    }

    /**
     * Apply a batch of team edits atomically and return the refreshed game summary.
     *
     * @param  int    $gameId   Identifier of the game.
     * @param  int    $teamId   Identifier of the team to update.
     * @param  array<string, mixed>  $payload  Validated batch payload containing:
     *   - name               (string)  New team name.
     *   - remove_player_ids  (int[])   IDs of players to detach from the team.
     *   - add_players        (array[]) Player descriptors to add (each has name and/or user_id).
     *   - seat_swaps         (array[]) Pairs of player IDs whose seats should be swapped.
     * @return array<string, mixed> Game summary payload after all changes are applied.
     * Logic:
     *   1. Enforce the game-is-in-progress guard.
     *   2. Resolve the team and confirm it belongs to the game.
     *   3. Open a DB transaction and apply all four change vectors in order:
     *      a. Rename the team.
     *      b. For each player ID in remove_player_ids: delete the seat row then the pivot row.
     *      c. For each descriptor in add_players: reject duplicates, resolve or create the player
     *         model, attach to the team, and assign a seat.
     *      d. For each pair in seat_swaps: swap the two seat numbers via the repository.
     *   4. Commit, then broadcast and return the refreshed summary once.
     */
    public function batchUpdateTeam(int $gameId, int $teamId, array $payload): array
    {
        $game = $this->gameRepository->findGameOrFail($gameId);

        if ($game->status !== GameStatus::InProgress) {
            throw ValidationException::withMessages([
                'game' => 'Cannot update teams in a finished game.',
            ]);
        }

        $team = $this->teamRepository->findTeamInGameOrFail($gameId, $teamId);

        DB::transaction(function () use ($gameId, $teamId, $team, $payload): void {
            // a. Rename
            $this->teamRepository->updateTeam($team, ['name' => $payload['name']]);

            // b. Remove players
            foreach (($payload['remove_player_ids'] ?? []) as $playerId) {
                $this->seatRepository->removePlayerSeatForTeam($teamId, (int) $playerId);
                $this->playerRepository->detachPlayerFromTeam($teamId, (int) $playerId);
            }

            // c. Add players
            foreach (($payload['add_players'] ?? []) as $descriptor) {
                $incomingName = $descriptor['name'] ?? null;

                if ($incomingName !== null && $this->playerRepository->teamHasPlayerWithName($teamId, $incomingName)) {
                    throw ValidationException::withMessages([
                        'add_players' => "A player named \"{$incomingName}\" already exists in this team.",
                    ]);
                }

                $player = $this->resolvePlayer($descriptor);

                $this->playerRepository->attachPlayerToTeam($teamId, $player->id);
                $this->seatRepository->assignPlayerSeat($gameId, $teamId, $player->id);
            }

            // d. Seat swaps
            foreach (($payload['seat_swaps'] ?? []) as $swap) {
                $this->seatRepository->swapPlayerSeats(
                    $gameId,
                    (int) $swap['player_id_a'],
                    (int) $swap['player_id_b'],
                );
            }
        });

        return $this->broadcastAndReturn($gameId);
    }

    /**
     * Resolve a Player model from a player descriptor array.
     *
     * @param  array<string, mixed>  $descriptor  Contains optional user_id and/or name.
     * @return \App\Models\Player The resolved or newly created player.
     * Logic: reuse the existing player record for a registered user via user_id; otherwise
     *   create an ad-hoc named player row so display-name guests do not require a user account.
     */
    private function resolvePlayer(array $descriptor): Player
    {
        $userId = isset($descriptor['user_id']) ? (int) $descriptor['user_id'] : null;

        if ($userId !== null) {
            return $this->playerRepository->findOrCreatePlayerFromUser(
                $userId,
                (string) ($descriptor['name'] ?? 'Registered Player'),
            );
        }

        return $this->playerRepository->createNamedPlayer((string) $descriptor['name']);
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
        $this->gameRepository->forgetGameSummaryCache($gameId);
        $data = $this->gameRepository->getGameSummary($gameId);
        $summary = (new GameSummaryResource($data))->resolve();

        broadcast(new GameUpdated($gameId, $summary))->toOthers();

        return $summary;
    }
}
