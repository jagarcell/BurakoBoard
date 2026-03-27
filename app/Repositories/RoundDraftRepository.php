<?php

namespace App\Repositories;

use App\Models\RoundDraft;

class RoundDraftRepository
{
    /**
     * Retrieve the round draft for a game, if one exists.
     *
     * @param  int  $gameId  Identifier of the game.
     * @return \App\Models\RoundDraft|null The draft or null if none has been saved yet.
     * Logic: look up a single draft row by game_id with round_number = 0 (active draft)
     * and return it, letting callers decide what to do when no draft exists yet.
     */
    public function getRoundDraft(int $gameId): ?RoundDraft
    {
        return RoundDraft::query()
            ->where('game_id', $gameId)
            ->where('round_number', 0)
            ->first();
    }

    /**
     * Retrieve the archived draft for a specific completed round.
     *
     * @param  int  $gameId      Identifier of the game.
     * @param  int  $roundNumber The round whose archived draft should be retrieved.
     * @return \App\Models\RoundDraft|null The archived draft or null if none was captured.
     * Logic: look up the draft row by game_id and round_number; a positive round_number
     * indicates a draft that was archived when that round was committed.
     */
    public function getRoundDraftForRound(int $gameId, int $roundNumber): ?RoundDraft
    {
        return RoundDraft::query()
            ->where('game_id', $gameId)
            ->where('round_number', $roundNumber)
            ->first();
    }

    /**
     * Create or update the round draft for a game.
     *
     * @param  int  $gameId      Identifier of the game.
     * @param  array<string, mixed>  $baseInputs  Per-team element values keyed by team ID then element ID.
     * @param  array<string, mixed>  $cardInputs  Per-team card counts keyed by team ID.
     * @return \App\Models\RoundDraft The created or updated draft.
     * Logic: use updateOrCreate to respect the unique index on game_id, then return the
     * fresh record so callers always see the persisted state.
     */
    public function upsertRoundDraft(int $gameId, array $baseInputs, array $cardInputs): RoundDraft
    {
        $draft = RoundDraft::query()->updateOrCreate(
            ['game_id' => $gameId, 'round_number' => 0],
            ['base_inputs' => $baseInputs, 'card_inputs' => $cardInputs],
        );

        return $draft->fresh();
    }

    /**
     * Archive the active draft for a game by assigning it the committed round number.
     *
     * @param  int  $gameId      Identifier of the game whose active draft should be archived.
     * @param  int  $roundNumber The round number just committed; applied to the active draft row.
     * @return void
     * Logic: update the active draft row (round_number = 0) to the committed round number so
     * it can be retrieved later as a historical scoring breakdown for that specific round.
     * If no active draft exists the operation is a silent no-op.
     */
    public function archiveRoundDraft(int $gameId, int $roundNumber): void
    {
        RoundDraft::query()
            ->where('game_id', $gameId)
            ->where('round_number', 0)
            ->update(['round_number' => $roundNumber]);
    }

    /**
     * Delete the round draft for a game.
     *
     * @param  int  $gameId  Identifier of the game whose draft should be removed.
     * @return void
     * Logic: remove the active draft row by game_id so stale inputs are not presented
     * to the user after a round has been successfully recorded.
     */
    public function deleteRoundDraft(int $gameId): void
    {
        RoundDraft::query()
            ->where('game_id', $gameId)
            ->where('round_number', 0)
            ->delete();
    }
}
