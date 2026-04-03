<?php

namespace App\Services;

use App\Repositories\CardWeightRepository;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;

class CardWeightService
{
    /**
     * Construct the service with its repository dependency.
     *
     * @param  \App\Repositories\CardWeightRepository  $repository  Handles all card_weights database queries.
     * @return void
     * Logic: Inject the dedicated repository to keep all database access out of the service layer.
     */
    public function __construct(private readonly CardWeightRepository $repository)
    {
    }

    /**
     * Return all card weights, served from the Redis cache when available.
     *
     * @return \Illuminate\Support\Collection<int, object> Ordered collection of card weight rows.
     * Logic: Wraps the repository call with Cache::remember keyed on 'card_weights'. The TTL is
     * set to one day because card point values are static catalogue data that changes only when
     * CardWeightSeeder is re-run (which calls Cache::forget to bust the key). This avoids
     * touching the database on every OCR scanner open.
     */
    public function getAll(): Collection
    {
        return Cache::remember('card_weights', now()->addDay(), fn () => $this->repository->getAll());
    }
}
