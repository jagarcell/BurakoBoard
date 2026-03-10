<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RoundScore extends Model
{
    /**
     * The table associated with the model.
     *
     * @var string
     */
    protected $table = 'round_scores';

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
        'round_id',
        'team_id',
        'points',
    ];

    /**
     * Get the round this score entry belongs to.
     *
     * @param  none
     * @return \Illuminate\Database\Eloquent\Relations\BelongsTo<\App\Models\Round, $this> Parent round for this score entry.
     * Logic: expose the inverse of the rounds.scores has-many so a score entry can resolve its parent round and from there its game.
     */
    public function round(): BelongsTo
    {
        return $this->belongsTo(Round::class, 'round_id');
    }

    /**
     * Get the team this score entry belongs to.
     *
     * @param  none
     * @return \Illuminate\Database\Eloquent\Relations\BelongsTo<\App\Models\Team, $this> Team that scored in this round entry.
     * Logic: expose the inverse of the teams.roundScores has-many so the owning team can be resolved from any score row.
     */
    public function team(): BelongsTo
    {
        return $this->belongsTo(Team::class, 'team_id');
    }
}
