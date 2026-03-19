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
     * Add a new voice alias for the given user.
     *
     * @param int    $userId  The authenticated user's ID.
     * @param string $alias   The misheard word from voice recognition.
     * @param string $keyword The intended word the user meant to say.
     * @return UserVoiceAlias The newly created alias.
     *
     * Logic: Delegates creation to the repository, which normalises case before
     *   persisting. The unique (user_id, alias) DB constraint prevents duplicates;
     *   the FormRequest validation rule is the primary guard in request flows.
     */
    public function addAlias(int $userId, string $alias, string $keyword): UserVoiceAlias
    {
        return $this->repository->create($userId, $alias, $keyword);
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
