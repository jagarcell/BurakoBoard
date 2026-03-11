<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BaseElement extends Model
{
    /**
     * The table associated with the model.
     *
     * @var string
     */
    protected $table = 'base_elements';

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
        'label',
        'points',
        'input_type',
    ];

    /**
     * The attributes that should be cast to native types.
     *
     * @var array<string, string>
     */
    protected $casts = [
        'points' => 'integer',
    ];
}
