<?php

namespace App\Repositories;

use App\Models\Round;
use App\Models\RoundScore;

class RoundRepository
{
    /**
     * Calculate the next round number for a game.
     *
     * @param  int  $gameId  Identifier of the game.
     * @return int The next round number.
     * Logic: read current max round_number for the game using a row-level lock to serialise
     * concurrent writes, then increment by one. Must be called inside a DB::transaction to
     * ensure the lock is effective.
     */
    public function getNextRoundNumber(int $gameId): int
    {
        $maxRound = Round::query()
            ->where('game_id', $gameId)
            ->lockForUpdate()
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
     * Resolve a specific round in a game by its round number.
     *
     * @param  int  $gameId  Identifier of the game.
    * @param  int  $roundNumber  Round number within the game timeline.
    * @return \App\Models\Round The matching round model.
     * Logic: constrain by both game_id and round_number so callers cannot accidentally amend a
     * round that belongs to another game.
     */
    public function findRoundInGameOrFail(int $gameId, int $roundNumber): Round
    {
        return Round::query()
            ->where('game_id', $gameId)
            ->where('round_number', $roundNumber)
            ->firstOrFail();
    }

    /**
     * Update one team's points for an existing round.
     *
     * @param  int  $roundId  Identifier of the round.
     * @param  int  $teamId  Identifier of the team.
     * @param  int  $points  New points value for this round/team pair.
     * @return void
     * Logic: update the existing round_scores row for the round/team pair; if no row exists,
     * create it so the round remains complete and self-healing.
     */
    public function upsertRoundScore(int $roundId, int $teamId, int $points): void
    {
        RoundScore::query()->updateOrCreate(
            ['round_id' => $roundId, 'team_id' => $teamId],
            ['points' => $points],
        );
    }

    /**
     * Return the latest round number recorded for a game.
     *
     * @param  int  $gameId  Identifier of the game.
     * @return int The highest round_number, or 0 when no rounds exist.
     * Logic: aggregate MAX(round_number) scoped to the game so services can reconcile
     * game.current_round_number after score amendments.
     */
    public function getMaxRoundNumberForGame(int $gameId): int
    {
        return (int) Round::query()
            ->where('game_id', $gameId)
            ->max('round_number');
    }
}
