<?php

namespace App\Repositories;

use App\Models\User;
use Illuminate\Support\Str;
use Laravel\Socialite\Contracts\User as SocialiteUser;

class UserRepository
{
    /**
     * Find a user by the OAuth provider's unique identifier.
     *
     * @param  string $providerIdColumn  The column name, e.g. 'google_id' or 'apple_id'.
     * @param  string $providerId        The provider's user ID value to match.
     * @return User|null  The matching user, or null if none exists.
     *
     * Logic: Queries the users table for a row whose provider ID column matches
     *   the given value. Returns null when no match is found so the caller can
     *   fall back to an e-mail lookup.
     */
    public function findByProviderId(string $providerIdColumn, string $providerId): ?User
    {
        return User::where($providerIdColumn, $providerId)->first();
    }

    /**
     * Find a user by e-mail address.
     *
     * @param  string $email  The e-mail address to look up.
     * @return User|null  The matching user, or null if none exists.
     *
     * Logic: Simple exact-match lookup on the email column. Used as a fallback
     *   when no provider ID match is found, allowing existing accounts created
     *   through other providers or password-based registration to be linked.
     */
    public function findByEmail(string $email): ?User
    {
        return User::where('email', $email)->first();
    }

    /**
     * Attach a provider ID to an existing user account.
     *
     * @param  User   $user              The user record to update.
     * @param  string $providerIdColumn  The column name, e.g. 'google_id' or 'apple_id'.
     * @param  string $providerId        The provider's user ID value to store.
     * @return void
     *
     * Logic: Writes the provider ID so that subsequent logins use the faster
     *   provider-ID lookup path instead of the e-mail fallback.
     */
    public function attachProviderId(User $user, string $providerIdColumn, string $providerId): void
    {
        $user->update([$providerIdColumn => $providerId]);
    }

    /**
     * Create a new user account seeded from an OAuth provider payload.
     *
     * @param  string        $providerIdColumn  The column name, e.g. 'google_id' or 'apple_id'.
     * @param  string        $providerId        The provider's user ID value.
     * @param  string        $email             The e-mail address returned by the provider.
     * @param  string        $name              The display name to store (already resolved by the caller).
     * @return User  The newly created user model.
     *
     * Logic: Inserts a new users row with the provider ID, a cryptographically
     *   random password (the user may set a real one later via the
     *   forgot-password flow), and email_verified_at pre-set because the
     *   address has already been verified by the OAuth provider.
     */
    public function createFromProvider(
        string $providerIdColumn,
        string $providerId,
        string $email,
        string $name,
    ): User {
        return User::create([
            'name'              => $name,
            'email'             => $email,
            $providerIdColumn   => $providerId,
            'password'          => bcrypt(Str::random(32)),
            'email_verified_at' => now(),
        ]);
    }
}
