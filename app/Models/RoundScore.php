<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

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
}
