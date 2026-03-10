<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
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
    ];

    /**
     * Get the teams that belong to the game.
     *
     * @param  none
     * @return \Illuminate\Database\Eloquent\Relations\HasMany<\App\Models\Team, $this> Teams associated with the game.
     * Logic: expose the one-to-many link from games.id to teams.game_id so team rosters can be loaded through the game model.
     */
    public function teams(): HasMany
    {
        return $this->hasMany(Team::class, 'game_id');
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
