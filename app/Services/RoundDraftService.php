<?php

namespace App\Services;

use App\Enums\GameStatus;
use App\Events\RoundDraftUpdated;
use App\Models\RoundDraft;
use App\Repositories\GameRepository;
use App\Repositories\RoundDraftRepository;
use Illuminate\Validation\ValidationException;

class RoundDraftService
{
    /**
     * Construct the service with round-draft repository dependencies.
     *
     * @param  \App\Repositories\GameRepository       $gameRepository       Needed to verify game existence and status before draft operations.
     * @param  \App\Repositories\RoundDraftRepository $roundDraftRepository Handles draft upsert, archive, and retrieval.
     * @return void
     * Logic: inject only the repositories required for draft persistence owned by this service.
     */
    public function __construct(
        private readonly GameRepository $gameRepository,
        private readonly RoundDraftRepository $roundDraftRepository,
    ) {
    }

    /**
     * Return the current round draft for a game, or null if none exists.
     *
     * @param  int  $gameId  Identifier of the game.
     * @return \App\Models\RoundDraft|null The draft or null if no draft has been saved yet.
     * Logic: confirm the game exists before delegating the lookup to the repository so unknown
     *   game IDs raise a 404 rather than returning a silent null.
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
     *   then delegate the lookup to the repository using the composite (game_id, round_number) key.
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
     *   to the repository, maintaining the one-draft-per-game invariant. Broadcasts the
     *   updated draft to other channel members for real-time sync.
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
}
