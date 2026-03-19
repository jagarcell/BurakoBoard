<?php

namespace App\Repositories;

use App\Models\UserVoiceAlias;
use Illuminate\Database\Eloquent\Collection;

class UserVoiceAliasRepository
{
    /**
     * Get all voice aliases for a specific user, ordered alphabetically.
     *
     * @param int $userId The ID of the user whose aliases to retrieve.
     * @return Collection<int, UserVoiceAlias>
     *
     * Logic: Selects only the columns the API resource needs, scoped to the given
     *   user and ordered by alias text for consistent display in the UI.
     */
    public function forUser(int $userId): Collection
    {
        return UserVoiceAlias::where('user_id', $userId)
            ->select(['id', 'user_id', 'alias', 'keyword'])
            ->orderBy('alias')
            ->get();
    }

    /**
     * Create a new voice alias for a user.
     *
     * @param int    $userId  The ID of the user who owns this alias.
     * @param string $alias   The misheard word (what voice recognition returns).
     * @param string $keyword The intended word (what the user actually said).
     * @return UserVoiceAlias The newly created alias model.
     *
     * Logic: Normalises both strings to lowercase and trims whitespace before
     *   persisting, so comparisons are consistent regardless of input casing.
     *   The unique constraint on (user_id, alias) is the authoritative guard
     *   against duplicates — callers should catch UniqueConstraintViolationException
     *   if they need to surface a duplicate error (the FormRequest validation rule
     *   catches this first in normal request flows).
     */
    public function create(int $userId, string $alias, string $keyword): UserVoiceAlias
    {
        return UserVoiceAlias::create([
            'user_id' => $userId,
            'alias'   => strtolower(trim($alias)),
            'keyword' => strtolower(trim($keyword)),
        ]);
    }

    /**
     * Delete a voice alias, scoped to the owning user.
     *
     * @param int $aliasId The primary key of the alias to delete.
     * @param int $userId  The authenticated user's ID used as an ownership guard.
     * @return bool True if a row was deleted; false if not found or not owned.
     *
     * Logic: Adds a WHERE user_id = $userId condition alongside the primary key so
     *   a user cannot delete another user's alias even with a guessed alias ID.
     */
    public function delete(int $aliasId, int $userId): bool
    {
        return (bool) UserVoiceAlias::where('id', $aliasId)
            ->where('user_id', $userId)
            ->delete();
    }
}
