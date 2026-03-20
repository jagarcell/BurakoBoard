<?php

namespace App\Services;

use App\Models\UserVoiceAlias;
use App\Repositories\UserVoiceAliasRepository;
use Illuminate\Database\Eloquent\Collection;

class UserVoiceAliasService
{
    /**
     * @param UserVoiceAliasRepository $repository
     * @return void
     *
     * Logic: Stores the repository dependency injected by the service container.
     */
    public function __construct(private readonly UserVoiceAliasRepository $repository)
    {
    }

    /**
     * Retrieve all voice aliases for the given user.
     *
     * @param int $userId The authenticated user's ID.
     * @return Collection<int, UserVoiceAlias>
     *
     * Logic: Delegates to the repository to load aliases sorted alphabetically,
     *   keeping all query concerns out of the service layer.
     */
    public function getAliasesForUser(int $userId): Collection
    {
        return $this->repository->forUser($userId);
    }

    /**
     * Find an existing alias or create a new one for the given user.
     *
     * @param int    $userId  The authenticated user's ID.
     * @param string $alias   The misheard word from voice recognition.
     * @param string $keyword The intended word the user meant to say.
     * @return array{0: UserVoiceAlias, 1: bool} Tuple of [alias model, wasCreated].
     *   wasCreated is true when a new record was inserted, false when the alias
     *   already existed and the existing record was returned instead.
     *
     * Logic: Checks the repository for an existing alias matching the user_id and
     *   alias word (after normalisation). Returns the existing record unchanged when
     *   found, or delegates creation to the repository when no match exists.
     *   The bool flag lets callers distinguish 200 (existing) from 201 (new).
     */
    public function findOrCreateAlias(int $userId, string $alias, string $keyword): array
    {
        $existing = $this->repository->findByUserAndAlias($userId, $alias);

        if ($existing) {
            return [$existing, false];
        }

        return [$this->repository->create($userId, $alias, $keyword), true];
    }

    /**
     * Remove a voice alias owned by the given user.
     *
     * @param int $aliasId The primary key of the alias to delete.
     * @param int $userId  The authenticated user's ID (ownership scope guard).
     * @return bool True if the alias was deleted; false if not found or not owned.
     *
     * Logic: Delegates to the repository, which enforces user ownership so a user
     *   cannot delete another user's alias.
     */
    public function removeAlias(int $aliasId, int $userId): bool
    {
        return $this->repository->delete($aliasId, $userId);
    }
}
