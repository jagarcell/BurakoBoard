<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasManyThrough;

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

    /**
     * Get this team's individual round-score entries.
     *
     * @param  none
     * @return \Illuminate\Database\Eloquent\Relations\HasMany<\App\Models\RoundScore, $this> All per-round score rows for this team.
     * Logic: expose the one-to-many link from teams.id to round_scores.team_id so scores can be loaded and summed through the team.
     */
    public function roundScores(): HasMany
    {
        return $this->hasMany(RoundScore::class, 'team_id');
    }

    /**
     * Get all rounds played by this team through its round-score entries.
     *
     * @param  none
     * @return \Illuminate\Database\Eloquent\Relations\HasManyThrough<\App\Models\Round, \App\Models\RoundScore, $this> Rounds reachable via round_scores.
     * Logic: traverse the team → round_scores → rounds path so round metadata can be loaded without a manual join.
     */
    public function rounds(): HasManyThrough
    {
        return $this->hasManyThrough(
            Round::class,
            RoundScore::class,
            'team_id',
            'id',
            'id',
            'round_id'
        );
    }
}
