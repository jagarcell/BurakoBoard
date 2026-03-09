<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Team extends Model
{
    /**
     * The table associated with the model.
     *
     * @var string
     */
    protected $table = 'teams';

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
        'name',
        'current_score',
    ];

    /**
     * Get the game that owns the team.
     *
     * @param  none
     * @return \Illuminate\Database\Eloquent\Relations\BelongsTo<\App\Models\Game, $this> Parent game for the team.
     * Logic: expose the inverse side of the teams.game_id foreign key so each team can resolve its game.
     */
    public function game(): BelongsTo
    {
        return $this->belongsTo(Game::class, 'game_id');
    }

    /**
     * Get the players assigned to the team.
     *
     * @param  none
     * @return \Illuminate\Database\Eloquent\Relations\BelongsToMany<\App\Models\Player> Players linked through the team_player pivot.
     * Logic: model team membership through the pivot table because users join teams indirectly via player records.
     */
    public function players(): BelongsToMany
    {
        return $this->belongsToMany(Player::class, 'team_player', 'team_id', 'player_id')
            ->withTimestamps();
    }
}
