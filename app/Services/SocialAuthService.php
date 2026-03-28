<?php

namespace App\Services;

use App\Models\User;
use App\Repositories\UserRepository;
use Illuminate\Support\Str;
use Laravel\Socialite\Contracts\User as SocialiteUser;

class SocialAuthService
{
    /**
     * Construct the service with its repository dependency.
     *
     * @param  \App\Repositories\UserRepository  $userRepository  Handles all User database queries.
     * @return void
     * Logic: injects the repository so findOrCreateUser() has no inline queries.
     */
    public function __construct(
        private readonly UserRepository $userRepository,
    ) {}

    /**
     * Find an existing user for the given OAuth provider or create a new one.
     *
     * @param  string        $provider       The OAuth provider name ('google' or 'apple').
     * @param  SocialiteUser $socialiteUser  The user object returned by Socialite.
     * @return User  The resolved (existing or newly created) Eloquent user model.
     *
     * Logic: First attempts to locate a user whose `{provider}_id` column matches the
     *   provider's user ID so that subsequent logins are O(1) by the indexed OAuth ID.
     *   If not found, falls back to an e-mail match; when the e-mail matches an existing
     *   account the provider ID is attached so future logins use the fast path.
     *   When neither match exists, a new account is created via the repository.
     *   Apple only supplies the display name on the very first authorisation, so a fallback
     *   is derived from the e-mail local-part for all subsequent logins.
     */
    public function findOrCreateUser(string $provider, SocialiteUser $socialiteUser): User
    {
        $idColumn = $provider . '_id';

        $user = $this->userRepository->findByProviderId($idColumn, $socialiteUser->getId());

        if (! $user) {
            $user = $this->userRepository->findByEmail($socialiteUser->getEmail());

            if ($user) {
                $this->userRepository->attachProviderId($user, $idColumn, $socialiteUser->getId());
            } else {
                $name = $socialiteUser->getName()
                    ?? Str::before($socialiteUser->getEmail(), '@');

                $user = $this->userRepository->createFromProvider(
                    $idColumn,
                    $socialiteUser->getId(),
                    $socialiteUser->getEmail(),
                    $name,
                );
            }
        }

        return $user;
    }
}
