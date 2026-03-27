<?php

namespace App\Services;

use App\Enums\GameStatus;
use App\Events\GameUpdated;
use App\Repositories\GameRepository;
use App\Repositories\SeatRepository;
use App\Repositories\TeamRepository;
use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;

class TeamService
{
    /**
     * Construct the service with team-management repository dependencies.
     *
     * @param  \App\Repositories\GameRepository  $gameRepository  Needed for game status guards and summary broadcast.
     * @param  \App\Repositories\TeamRepository  $teamRepository  Handles team CRUD and game_team pivot.
     * @param  \App\Repositories\SeatRepository  $seatRepository  Handles seat reassignment when teams are attached.
     * @return void
     * Logic: inject only the repositories required for team-management concerns owned by this service.
     */
    public function __construct(
        private readonly GameRepository $gameRepository,
        private readonly TeamRepository $teamRepository,
        private readonly SeatRepository $seatRepository,
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
        $summary = $this->gameRepository->getGameSummary($gameId);

        broadcast(new GameUpdated($gameId, $summary))->toOthers();

        return $summary;
    }
}
