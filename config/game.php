<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Game Summary Round Limit
    |--------------------------------------------------------------------------
    |
    | Maximum number of rounds returned in the getGameSummary payload.
    | When a game has more rounds than this threshold the summary will include
    | only the most recent N rounds and set has_more_rounds = true so the
    | client knows it can load older rounds via GET /api/v1/games/{id}/rounds.
    |
    */

    'summary_round_limit' => env('GAME_SUMMARY_ROUND_LIMIT', 50),

];
