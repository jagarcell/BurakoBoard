<?php

namespace App\Providers;

use App\Repositories\GameRepository;
use App\Repositories\InvitationRepository;
use App\Repositories\PlayerRepository;
use App\Repositories\RoundDraftRepository;
use App\Repositories\RoundRepository;
use App\Repositories\SeatRepository;
use App\Repositories\TeamRepository;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Vite;
use Illuminate\Support\ServiceProvider;
use SocialiteProviders\Apple\AppleExtendSocialite;
use SocialiteProviders\Manager\SocialiteWasCalled;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     *
     * @return void
     * Logic: bind each domain repository to its concrete class so the Laravel container
     * can inject them by type-hint into services and controllers without extra configuration.
     */
    public function register(): void
    {
        $this->app->bind(GameRepository::class, GameRepository::class);
        $this->app->bind(TeamRepository::class, TeamRepository::class);
        $this->app->bind(PlayerRepository::class, PlayerRepository::class);
        $this->app->bind(SeatRepository::class, SeatRepository::class);
        $this->app->bind(RoundRepository::class, RoundRepository::class);
        $this->app->bind(RoundDraftRepository::class, RoundDraftRepository::class);
        $this->app->bind(InvitationRepository::class, InvitationRepository::class);
    }

    /**
     * Bootstrap any application services.
     *
     * @return void
     * Logic: enable Vite prefetching to improve asset loading on first page
     *        interaction, and register the Apple Socialite driver so that
     *        Socialite::driver('apple') is available throughout the application.
     */
    public function boot(): void
    {
        Vite::prefetch(concurrency: 3);

        Event::listen(SocialiteWasCalled::class, [AppleExtendSocialite::class, 'handle']);

        /**
         * Register the named 'api' rate limiter used by all authenticated API mutation routes.
         *
         * @param  \Illuminate\Http\Request  $request
         * @return \Illuminate\Cache\RateLimiting\Limit
         * Logic: allow 60 requests per minute keyed by the authenticated user's ID so that
         *   each user's quota is independent, falling back to the request IP for unauthenticated
         *   requests to prevent anonymous flooding.
         */
        RateLimiter::for('api', function (Request $request): Limit {
            return Limit::perMinute(60)->by($request->user()?->id ?: $request->ip());
        });
    }
}
