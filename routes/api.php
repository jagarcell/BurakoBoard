<?php

use App\Http\Controllers\Api\V1\GameController;
use App\Http\Controllers\Api\V1\RoundController;
use App\Http\Controllers\Api\V1\TeamController;
use App\Http\Controllers\Api\V1\TeamPlayerController;
use App\Http\Controllers\Api\V1\UserController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function () {
    Route::get('/health', fn () => [
        'app' => config('app.name'),
        'health' => 'ok',
    ]);

    Route::get('/users', [UserController::class, 'index']);

    Route::get('/games', [GameController::class, 'index']);
    Route::post('/games', [GameController::class, 'store']);
    Route::get('/games/{gameId}', [GameController::class, 'show']);
    Route::put('/games/{gameId}', [GameController::class, 'update']);
    Route::post('/games/{gameId}/teams', [TeamController::class, 'store']);
    Route::post('/games/{gameId}/teams/{teamId}/players', [TeamPlayerController::class, 'store']);
    Route::post('/games/{gameId}/rounds', [RoundController::class, 'store']);

    Route::middleware('auth:sanctum')->group(function () {
        Route::get('/user', function (Request $request) {
            return [
                'user' => $request->user(),
            ];
        });
    });
});
