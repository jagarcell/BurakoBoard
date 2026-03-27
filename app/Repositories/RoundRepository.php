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
}
