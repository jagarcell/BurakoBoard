<?php

namespace App\Providers;

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
     */
    public function register(): void
    {
        //
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
