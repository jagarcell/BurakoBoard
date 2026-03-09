<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function () {
    Route::get('/health', fn () => [
        'app' => config('app.name'),
        'health' => 'ok',
    ]);

    Route::middleware('auth:sanctum')->group(function () {
        Route::get('/user', function (Request $request) {
            return [
                'user' => $request->user(),
            ];
        });
    });
});
