<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CardWeight extends Model
{
    /**
     * The table associated with the model.
     *
     * @var string
     */
    protected $table = 'card_weights';

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
        'rank',
        'label',
        'points',
        'sort_order',
    ];

    /**
     * The attributes that should be cast to native types.
     *
     * @var array<string, string>
     */
    protected $casts = [
        'points'     => 'integer',
        'sort_order' => 'integer',
    ];
}
