<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Game extends Model
{
    /**
     * The table associated with the model.
     *
     * @var string
     */
    protected $table = 'games';

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
        'name',
        'target_points',
        'status',
        'winning_team_id',
        'current_round_number',
        'initial_shuffler_seat_number',
    ];

    /**
     * Get the teams that participate in this game.
     *
     * @param  none
     * @return \Illuminate\Database\Eloquent\Relations\BelongsToMany<\App\Models\Team, $this> Teams associated with the game.
     * Logic: expose the many-to-many link via game_team so one team entity can be reused across multiple games;
     * each game-team pair tracks its own current_score on the pivot.
     */
    public function teams(): BelongsToMany
    {
        return $this->belongsToMany(Team::class, 'game_team')
            ->withPivot('current_score');
    }

    /**
     * Get the rounds that belong to the game.
     *
     * @param  none
     * @return \Illuminate\Database\Eloquent\Relations\HasMany<\App\Models\Round, $this> Rounds played in this game.
     * Logic: expose the one-to-many link from games.id to rounds.game_id so round history can be traversed from the game model.
     */
    public function rounds(): HasMany
    {
        return $this->hasMany(Round::class, 'game_id');
    }
}
