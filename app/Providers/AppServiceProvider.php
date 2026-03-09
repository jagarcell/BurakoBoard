<?php

namespace App\Providers;

use Illuminate\Support\Facades\Vite;
use Illuminate\Support\ServiceProvider;

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
     * Logic: enable Vite prefetching to improve asset loading on first page interaction.
     */
    public function boot(): void
    {
        Vite::prefetch(concurrency: 3);
    }
}
