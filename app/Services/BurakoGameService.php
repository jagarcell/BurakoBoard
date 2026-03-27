<?php

namespace App\Services;

use App\Events\GameInvitationSent;
use App\Events\GameUpdated;
use App\Events\RoundDraftUpdated;
use App\Enums\GameStatus;
use App\Enums\GameUserRole;
use App\Mail\GameInvitationMail;
use App\Models\Game;
use App\Models\Player;
use App\Models\RoundDraft;
use App\Models\User;
use App\Repositories\GameRepository;
use App\Repositories\InvitationRepository;
use App\Repositories\PlayerRepository;
use App\Repositories\RoundDraftRepository;
use App\Repositories\RoundRepository;
use App\Repositories\SeatRepository;
use App\Repositories\TeamRepository;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Collection;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Validation\ValidationException;
use Symfony\Component\Mailer\Exception\TransportExceptionInterface;

class BurakoGameService
{
    /**
     * Construct the service with domain repository dependencies.
     *
     * @param  \App\Repositories\GameRepository  $gameRepository  Handles game CRUD and game_user pivot.
     * @param  \App\Repositories\TeamRepository  $teamRepository  Handles team CRUD and game_team pivot.
     * @param  \App\Repositories\PlayerRepository  $playerRepository  Handles player CRUD and team_player pivot.
     * @param  \App\Repositories\SeatRepository  $seatRepository  Handles game_player_seat read/write.
     * @param  \App\Repositories\RoundRepository  $roundRepository  Handles Round and RoundScore creation.
     * @param  \App\Repositories\RoundDraftRepository  $roundDraftRepository  Handles draft upsert, archive, delete.
     * @param  \App\Repositories\InvitationRepository  $invitationRepository  Handles pending-invitee queries and lifecycle.
     * @return void
     * Logic: inject each domain repository so that constructor arguments are explicit and each
     * repository can be mocked independently in tests without accounting for unrelated methods.
     */
    public function __construct(
        private readonly GameRepository $gameRepository,
        private readonly TeamRepository $teamRepository,
        private readonly PlayerRepository $playerRepository,
        private readonly SeatRepository $seatRepository,
        private readonly RoundRepository $roundRepository,
        private readonly RoundDraftRepository $roundDraftRepository,
        private readonly InvitationRepository $invitationRepository,
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
     * Return the games for which the authenticated user has a pending invitation.
     *
     * @param  int  $userId  Identifier of the authenticated user.
     * @return \Illuminate\Support\Collection<int, \App\Models\Game> Pending-invitation games.
     * Logic: delegate to the repository to retrieve only the games where the user holds a
     *   pending_invitee pivot row, providing a focused payload for the bell popup refresh
     *   on each bell click so the list is always up to date.
     */
    public function listPendingInvitations(int $userId): Collection
    {
        return $this->invitationRepository->getPendingInvitations($userId);
    }

    /**
     * Determine whether a user has at least one pending game invitation.
     *
     * @param  int  $userId  Identifier of the authenticated user.
     * @return bool True when the user has one or more pending_invitee rows in game_user.
     * Logic: delegate the existence check to the invitation repository so callers such as
     *   middleware can query this without bypassing the service layer.
     */
    public function userHasPendingInvitations(int $userId): bool
    {
        return $this->invitationRepository->hasPendingInvitations($userId);
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
            'name' => $payload['name'],
            'target_points' => (int) $payload['target_points'],
            'status' => GameStatus::InProgress,
            'winning_team_id' => null,
            'current_round_number' => 0,
            'initial_shuffler_seat_number' => null,
        ]);

        $this->gameRepository->attachUserToGame($game->id, $userId, GameUserRole::Creator->value);

        Log::info('Game created', ['game_id' => $game->id, 'creator_id' => $userId]);

        return $this->gameRepository->getGameSummary($game->id);
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
            'name' => $payload['name'],
            'target_points' => (int) $payload['target_points'],
        ]);
    }

    /**
     * Return all registered users available for player assignment.
     *
     * @return \Illuminate\Support\Collection<int, \App\Models\User> Registered users ordered by name.
     * Logic: delegate user list retrieval to the repository so the team creation dialog has a stable source of registered player candidates.
     */
    public function listUsers(): Collection
    {
        return $this->playerRepository->getUserList();
    }

    /**
     * Return a paginated list of users eligible to receive a viewer invite for a game.
     *
     * @param  int  $gameId         Identifier of the game for which invites would be sent.
     * @param  int  $excludeUserId  Identifier of the current authenticated user to exclude from results.
     * @param  int  $page           1-based page number requested by the caller.
     * @param  int  $perPage        Number of users per page; defaults to 10.
     * @return \Illuminate\Contracts\Pagination\LengthAwarePaginator<\App\Models\User> Paginated invitable users.
     * Logic: delegate to the repository so the invite dialog has a filtered, paginated user source
     *   without the service layer containing any query logic.
     */
    public function listInvitableUsers(int $gameId, int $excludeUserId, int $page, int $perPage = 10): LengthAwarePaginator
    {
        return $this->invitationRepository->getInvitableUsersForGame($gameId, $excludeUserId, $page, $perPage);
    }

    /**
     * Return all available base scoring elements.
     *
     * @return \Illuminate\Support\Collection<int, \App\Models\BaseElement> All base elements ordered by id.
     * Logic: delegate the base element retrieval to the repository so the controller can obtain the scoring
     * catalogue without direct query coupling.
     */
    public function listBaseElements(): Collection
    {
        return $this->gameRepository->getBaseElements();
    }

    /**
     * Return all teams with their players for the team selector.
     *
     * @return \Illuminate\Support\Collection<int, \App\Models\Team> All teams with players loaded.
     * Logic: delegate the all-teams query to the repository so the frontend team selector can present previously used teams.
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
     * attach it to the game via the pivot, then return the refreshed summary.
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
     * to this game (to prevent duplicate pivot rows), insert the pivot row, then assign seats for
     * all players already linked to that team so the game immediately has complete seat data.
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
     * Logic: enforce game status, resolve the team within the game, update its name, then return the refreshed summary.
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
     * Add a player to a team either by free-form name or by registered user id.
     *
     * @param  int  $gameId  Identifier of the game.
     * @param  int  $teamId  Identifier of the team.
     * @param  array<string, mixed>  $payload  Validated player input.
     * @return array<string, mixed> Game summary payload after player assignment.
     * Logic: block writes on finished games, reject duplicate player names within the team using a
     * case-insensitive normalised comparison, resolve player source (name or user), attach once to the team, then reload summary.
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
     * @param  int  $gameId   Identifier of the game.
     * @param  int  $teamId   Identifier of the team.
     * @param  int  $playerId Identifier of the player to remove.
     * @return array<string, mixed> Game summary payload after the player is removed.
     * Logic: block removal on finished games, verify the team belongs to the game,
     * detach the pivot row, then reload and return the updated game summary.
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
     * to the repository and return the refreshed summary so the client can reconcile state.
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
     * Set the initial cutter by selecting one seated player in the game.
     *
     * @param  int  $gameId  Identifier of the game.
     * @param  int  $playerId  Identifier of the selected cutter player.
     * @return array<string, mixed> Updated game summary payload.
     * Logic: enforce in-progress and pre-round constraints, validate the selected player is seated
     * in the game, persist that player's seat as the initial cutter anchor, then return summary.
     */
    public function setInitialShuffler(int $gameId, int $playerId): array
    {
        $game = $this->gameRepository->findGameOrFail($gameId);

        if ($game->status !== GameStatus::InProgress) {
            throw ValidationException::withMessages([
                'game' => 'Cannot set cutter for a finished game.',
            ]);
        }

        if ((int) $game->current_round_number > 0) {
            throw ValidationException::withMessages([
                'game' => 'Initial cutter can only be set before recording the first round.',
            ]);
        }

        $seatedPlayer = $this->seatRepository->findSeatedPlayerInGame($gameId, $playerId);

        if ($seatedPlayer === null) {
            throw ValidationException::withMessages([
                'player_id' => 'Selected player must belong to this game and have a seat.',
            ]);
        }

        $this->gameRepository->updateGameInitialShufflerSeat($game, (int) $seatedPlayer->seat_number);

        return $this->broadcastAndReturn($gameId);
    }

    /**
     * Record scores for one game round and update running totals.
     *
     * @param  int  $gameId  Identifier of the game.
     * @param  array<string, mixed>  $payload  Validated round score payload.
     * @return array<string, mixed> Game summary payload after recording the round.
     * Logic: validate full team coverage, persist round and per-team points in a transaction,
     * update totals, close game on winner, then archive the active draft under the committed
     * round number so it can later be retrieved as a read-only scoring breakdown.
     */
    public function recordRound(int $gameId, array $payload): array
    {
        $game = $this->gameRepository->findGameOrFail($gameId);

        if ($game->status !== GameStatus::InProgress) {
            throw ValidationException::withMessages([
                'game' => 'Cannot record rounds for a finished game.',
            ]);
        }

        $scores = collect($payload['scores']);
        $teams = $this->teamRepository->getTeamsForGame($gameId);
        $teamIds = $teams->pluck('id');
        $inputTeamIds = $scores->pluck('team_id');

        if ($teamIds->count() < 2) {
            throw ValidationException::withMessages([
                'scores' => 'At least two teams are required before recording rounds.',
            ]);
        }

        if ($inputTeamIds->sort()->values()->all() !== $teamIds->sort()->values()->all()) {
            throw ValidationException::withMessages([
                'scores' => 'Round scores must include every team in the game exactly once.',
            ]);
        }

        $committedRoundNumber = 0;

        try {
            DB::transaction(function () use ($game, $gameId, $scores, &$committedRoundNumber): void {
                $roundNumber = $this->roundRepository->getNextRoundNumber($gameId);
                $round = $this->roundRepository->createRound($gameId, $roundNumber);
                $committedRoundNumber = $roundNumber;

                $updatedTeams = collect();

                foreach ($scores as $score) {
                    $team = $this->teamRepository->findTeamInGameOrFail($gameId, (int) $score['team_id']);
                    $points = (int) $score['points'];

                    $this->roundRepository->createRoundScore($round->id, $team->id, $points);
                    $updatedTeam = $this->teamRepository->incrementTeamScore($gameId, $team->id, $points);
                    $updatedTeams->push($updatedTeam);
                }

                $winner = $this->resolveWinner($updatedTeams, (int) $game->target_points);

                if ($winner !== null) {
                    $this->gameRepository->finishGameWithWinner($game, $winner->id, $round->round_number);

                    return;
                }

                $this->gameRepository->updateGameRoundCounter($game, $round->round_number);
            });
        } catch (QueryException $e) {
            Log::error('DB transaction failed in recordRound', [
                'game_id'  => $gameId,
                'sql'      => $e->getSql(),
                'bindings' => $e->getBindings(),
                'message'  => $e->getMessage(),
                'user_id'  => auth()->id(),
            ]);
            throw ValidationException::withMessages([
                'round' => ['The round could not be saved due to a database error. Please try again.'],
            ]);
        }

        Log::info('Round recorded', [
            'game_id'      => $gameId,
            'round_number' => $committedRoundNumber,
        ]);

        // Archive the active draft under the committed round number so it can be
        // retrieved later as a read-only scoring breakdown for that round.
        $this->roundDraftRepository->archiveRoundDraft($gameId, $committedRoundNumber);

        return $this->broadcastAndReturn($gameId);
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
        return $this->gameRepository->getGameSummary($gameId);
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
     * Recompute and persist current_score for every team in a game from its round history.
     *
     * @param  int  $gameId  Identifier of the game whose team scores need syncing.
     * @return void Delegates recompute to the repository so each team's stored score matches the sum of its round_scores.
     * Logic: act as an orchestration entry point for score repair, ensuring service callers never touch the repository directly.
     */
    public function syncGameScores(int $gameId): void
    {
        $this->teamRepository->syncTeamScoresForGame($gameId);
    }

    /**
     * Return the current round draft for a game, or null if none exists.
     *
     * @param  int  $gameId  Identifier of the game.
     * @return \App\Models\RoundDraft|null The draft or null if no draft has been saved yet.
     * Logic: confirm the game exists before delegating the lookup to the repository
     * so unknown game IDs raise a 404 rather than returning a silent null.
     */
    public function getRoundDraft(int $gameId): ?RoundDraft
    {
        $this->gameRepository->findGameOrFail($gameId);

        return $this->roundDraftRepository->getRoundDraft($gameId);
    }

    /**
     * Return the archived draft captured when a specific round was committed.
     *
     * @param  int  $gameId      Identifier of the game.
     * @param  int  $roundNumber The round number whose draft should be retrieved.
     * @return \App\Models\RoundDraft|null The archived draft or null if none was captured for that round.
     * Logic: confirm the game exists so unknown game IDs raise a 404 rather than a silent null,
     * then delegate the lookup to the repository using the composite (game_id, round_number) key.
     */
    public function getRoundDraftForRound(int $gameId, int $roundNumber): ?RoundDraft
    {
        $this->gameRepository->findGameOrFail($gameId);

        return $this->roundDraftRepository->getRoundDraftForRound($gameId, $roundNumber);
    }

    /**
     * Create or update the round draft for a game with the provided input values.
     *
     * @param  int  $gameId   Identifier of the game.
     * @param  array<string, mixed>  $payload  Validated payload containing base_inputs and card_inputs.
     * @return \App\Models\RoundDraft The created or updated draft.
     * Logic: verify the game exists and is still in progress, then delegate persistence
     * to the repository, maintaining the one-draft-per-game invariant.
     */
    public function saveRoundDraft(int $gameId, array $payload): RoundDraft
    {
        $game = $this->gameRepository->findGameOrFail($gameId);

        if ($game->status !== GameStatus::InProgress) {
            throw ValidationException::withMessages([
                'game' => 'Cannot save a draft for a finished game.',
            ]);
        }

        $draft = $this->roundDraftRepository->upsertRoundDraft(
            $gameId,
            $payload['base_inputs'] ?? [],
            $payload['card_inputs'] ?? [],
        );

        broadcast(new RoundDraftUpdated(
            $gameId,
            $draft->base_inputs ?? [],
            $draft->card_inputs ?? [],
        ))->toOthers();

        return $draft;
    }

    /**
     * Build the game summary, broadcast it to other channel members, and return it.
     *
     * @param  int  $gameId  Identifier of the game that was mutated.
     * @return array<string, mixed> The refreshed game summary.
     * Logic: assemble the authoritative summary once, dispatch a GameUpdated event to every
     * other authenticated member of the private game channel so their UI reflects the change
     * without requiring a page reload, then return the summary to the HTTP layer.
     */
    private function broadcastAndReturn(int $gameId): array
    {
        $summary = $this->gameRepository->getGameSummary($gameId);

        broadcast(new GameUpdated($gameId, $summary))->toOthers();

        return $summary;
    }

    /**
     * Build a player model from payload rules.
     *
     * @param  array<string, mixed>  $payload  Validated player payload containing either user_id or name.
     * @return \App\Models\Player The resolved player model.
     * Logic: reuse existing player record for registered users, otherwise create an ad-hoc named player entry.
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
     * Resolve the winner based on target points and highest current score.
     *
     * @param  \Illuminate\Support\Collection<int, object>  $teams  Score rows updated after the round (stdClass with id, name, current_score).
     * @param  int  $targetPoints  Winning threshold configured for the game.
     * @return object|null The winning team row or null when no team reached target.
     * Logic: filter teams that reached target, rank by highest score with deterministic id tiebreaker, and return first match.
     */
    private function resolveWinner(Collection $teams, int $targetPoints): ?object
    {
        return $teams
            ->filter(fn (object $team): bool => $team->current_score >= $targetPoints)
            ->sortBy([
                ['current_score', 'desc'],
                ['id', 'asc'],
            ])
            ->first();
    }

    /**
     * Persist pending invitations and dispatch invitation emails to the selected users.
     *
     * @param  int              $gameId   Identifier of the game the users are being invited to watch.
     * @param  array<int>       $userIds  IDs of the users who should receive invitations.
     * @param  \App\Models\User $inviter  The authenticated user (creator) sending the invitations.
     * @return int Number of new invitation rows created and emailed.
     * Logic:
     *   1. Verify the game exists; abort with 404 if missing.
     *   2. Filter out any user IDs already enrolled in the game (any role) to prevent
     *      composite-primary-key violations on the pivot table.
     *   3. Load the target User models so we have name + email for mail dispatch.
     *   4. Bulk-insert `pending_invitee` rows in one query.
     *   5. Dispatch one GameInvitationMail per invitee; each mail carries the game, invitee,
     *      and inviter context needed to render the Blade email template.
     *   6. Broadcast GameInvitationSent on each invitee's private channel so the frontend
     *      notification bell updates in real time without a page reload.
     *   7. Return the count of new invitations created so the controller can include it in the response.
     */
    public function sendInvitations(int $gameId, array $userIds, User $inviter): int
    {
        $game = $this->gameRepository->findGameOrFail($gameId);

        $existingIds = $this->invitationRepository->getExistingGameUserIds($gameId, $userIds);
        $newUserIds  = array_values(array_diff($userIds, $existingIds));

        if (empty($newUserIds)) {
            return 0;
        }

        $this->invitationRepository->bulkAttachPendingInviteesToGame($gameId, $newUserIds);

        $invitees = $this->invitationRepository->getUsersByIds($newUserIds);

        foreach ($invitees as $invitee) {
            try {
                Mail::to($invitee->email)->send(new GameInvitationMail($game, $invitee, $inviter));
            } catch (TransportExceptionInterface $e) {
                Log::warning('Invitation email failed', [
                    'game_id'   => $game->id,
                    'recipient' => $invitee->email,
                    'reason'    => $e->getMessage(),
                ]);
            }
            broadcast(new GameInvitationSent(
                inviteeId:   $invitee->id,
                gameId:      $game->id,
                gameName:    $game->name,
                inviterName: $inviter->name,
            ))->toOthers();
        }

        Log::info('Invitations sent', [
            'game_id'    => $game->id,
            'count'      => count($newUserIds),
            'recipients' => $invitees->pluck('email')->all(),
        ]);

        return count($newUserIds);
    }

    /**
     * Accept a pending game invitation, upgrading the user's role from pending_invitee to viewer.
     *
     * @param  int  $gameId  Identifier of the game whose invitation should be accepted.
     * @param  int  $userId  Identifier of the authenticated user accepting the invitation.
     * @return \App\Models\Game The game model with user_role set to 'viewer'.
     * Logic: verify the game exists (404 if not), attempt to upgrade the pivot row from
     *   pending_invitee to viewer, and throw a validation exception when no matching row
     *   is found (user was never invited or already accepted). Finally, return the
     *   game record with the updated role attached so the controller can serialize
     *   a GameListItemResource without an additional query.
     */
    public function acceptInvitation(int $gameId, int $userId): Game
    {
        $this->gameRepository->findGameOrFail($gameId);

        $upgraded = $this->invitationRepository->upgradeInvitationToViewer($gameId, $userId);

        if (! $upgraded) {
            throw ValidationException::withMessages([
                'invitation' => 'No pending invitation found for this game.',
            ]);
        }

        return $this->gameRepository->getGameWithUserRole($gameId, $userId);
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
     *     (source round N+1) so the player order carries over correctly.
     *  4. Return the full summary payload after broadcast.
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

        return $this->gameRepository->getGameSummary($newGameId);
    }

    /**
     * Accept a pending game invitation silently, without throwing on missing rows.
     *
     * @param  int  $gameId  Identifier of the game whose invitation should be accepted.
     * @param  int  $userId  Identifier of the authenticated user.
     * @return bool True when the pivot row was upgraded from pending_invitee to viewer; false when no pending invitation existed.
     * Logic: delegates directly to the repository upgrade query and returns its boolean
     *   result. Unlike acceptInvitation() this method never throws, making it safe to
     *   call during the post-login flow where the game ID comes from the session and
     *   the user may have already manually accepted or may not have been invited at all.
     */
    public function acceptInvitationIfPending(int $gameId, int $userId): bool
    {
        return $this->invitationRepository->upgradeInvitationToViewer($gameId, $userId);
    }
}
