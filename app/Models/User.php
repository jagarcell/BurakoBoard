<?php

namespace App\Models;

use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Facades\Cache;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable implements MustVerifyEmail
{
    /** @use HasFactory<\Database\Factories\UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

    /**
     * Register Eloquent model event listeners.
     *
     * @return void
     * Logic: flush the cached user list whenever a new user is created so that the
     *   next call to PlayerRepository::getUserList() returns fresh data. This covers
     *   both the form-based registration path (RegisteredUserController) and the
     *   OAuth social-auth path (SocialAuthService / UserRepository::createFromProvider).
     */
    protected static function booted(): void
    {
        static::created(function (): void {
            Cache::forget('user_list');
        });
    }

    /**
     * The table associated with the model.
     *
     * @var string
     */
    protected $table = 'users';

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
        'email',
        'password',
        'google_id',
        'apple_id',
        'email_verified_at',
        'is_guest',
        'invited_by_id',
        'invited_at',
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var list<string>
     */
    protected $hidden = [
        'password',
        'remember_token',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'invited_at' => 'datetime',
        ];
    }

    /**
     * Get the player profile associated with the user.
     *
     * @param  none
     * @return \Illuminate\Database\Eloquent\Relations\HasOne<\App\Models\Player, $this> Player identity for the registered user.
     * Logic: expose the one-to-one link used by team membership so a user can resolve their reusable player record.
     */
    public function player(): HasOne
    {
        return $this->hasOne(Player::class, 'user_id');
    }

    /**
     * Get all voice recognition aliases owned by this user.
     *
     * @return HasMany<UserVoiceAlias, $this>
     *
     * Logic: Provides the one-to-many association so aliases are cascade-deleted
     *   with the user and can be eager-loaded when needed.
     */
    public function voiceAliases(): HasMany
    {
        return $this->hasMany(UserVoiceAlias::class);
    }

    /**
     * Get the games associated with this user.
     *
     * @return \Illuminate\Database\Eloquent\Relations\BelongsToMany<\App\Models\Game, $this> Games the user is linked to with their role.
     * Logic: exposes the many-to-many link via the game_user pivot table; the role column
     *   (creator | pending_invitee | viewer) is always eager-loaded on the pivot so callers
     *   can determine the user's relationship to each game without extra queries.
     */
    public function games(): BelongsToMany
    {
        return $this->belongsToMany(Game::class, 'game_user')
            ->withPivot('role')
            ->withTimestamps();
    }
}
