<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Round extends Model
{
    /**
     * The table associated with the model.
     *
     * @var string
     */
    protected $table = 'rounds';

    /**
     * The primary key associated with the table.
     *
     * @var string
     */
    protected $primaryKey = 'id';

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'game_id',
        'round_number',
    ];

    /**
     * Get the game this round was played in.
     *
     * @param  none
     * @return \Illuminate\Database\Eloquent\Relations\BelongsTo<\App\Models\Game, $this> Parent game for the round.
     * Logic: expose the inverse of the games.rounds has-many so a round can resolve its parent game.
     */
    public function game(): BelongsTo
    {
        return $this->belongsTo(Game::class, 'game_id');
    }

    /**
     * Get the per-team scores recorded for this round.
     *
     * @param  none
     * @return \Illuminate\Database\Eloquent\Relations\HasMany<\App\Models\RoundScore, $this> Score entries for each team in this round.
     * Logic: expose the one-to-many link from rounds.id to round_scores.round_id so per-team points can be loaded through the round.
     */
    public function scores(): HasMany
    {
        return $this->hasMany(RoundScore::class, 'round_id');
    }
}
