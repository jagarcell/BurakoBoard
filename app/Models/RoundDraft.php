<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RoundDraft extends Model
{
    /**
     * The table associated with the model.
     *
     * @var string
     */
    protected $table = 'round_drafts';

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
        'base_inputs',
        'card_inputs',
    ];

    /**
     * The attributes that should be cast to native types.
     *
     * @var array<string, string>
     */
    protected $casts = [
        'base_inputs' => 'array',
        'card_inputs' => 'array',
    ];

    /**
     * Get the game this draft belongs to.
     *
     * @param  none
     * @return \Illuminate\Database\Eloquent\Relations\BelongsTo<\App\Models\Game, $this> Parent game for this draft.
     * Logic: expose the inverse of the games.roundDraft has-one so a draft can resolve its
     * parent game and vice versa; cascadeOnDelete in the migration ensures orphaned drafts
     * are never left behind when a game is deleted.
     */
    public function game(): BelongsTo
    {
        return $this->belongsTo(Game::class, 'game_id');
    }
}
