<?php

namespace App\Repositories;

use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class CardWeightRepository
{
    /**
     * Retrieve all card weight records ordered by sort_order ascending.
     *
     * @return \Illuminate\Support\Collection<int, object> Collection of card weight rows.
     * Logic: Uses the query builder (not Eloquent) because the result is a simple flat list
     * with no relationships, accessories, or API Resource shaping needed at this layer.
     * Only the columns consumed by the frontend and the cache are selected to minimise
     * data transfer.
     */
    public function getAll(): Collection
    {
        return DB::table('card_weights')
            ->select(['rank', 'label', 'points', 'sort_order'])
            ->orderBy('sort_order')
            ->get();
    }
}
