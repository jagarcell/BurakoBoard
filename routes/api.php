<?php

use App\Http\Controllers\Api\V1\BaseElementController;
use App\Http\Controllers\Api\V1\GameController;
use App\Http\Controllers\Api\V1\RoundController;
use App\Http\Controllers\Api\V1\RoundDraftController;
use App\Http\Controllers\Api\V1\TeamController;
use App\Http\Controllers\Api\V1\TeamPlayerController;
use App\Http\Controllers\Api\V1\UserController;
use App\Http\Controllers\Api\V1\UserVoiceAliasController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function () {
    Route::get('/health', fn () => [
        'app' => config('app.name'),
        'health' => 'ok',
    ]);

    Route::get('/users', [UserController::class, 'index']);
    Route::get('/teams', [TeamController::class, 'index']);
    Route::get('/base-elements', [BaseElementController::class, 'index']);

    Route::get('/games/{gameId}', [GameController::class, 'show']);
    Route::put('/games/{gameId}', [GameController::class, 'update']);
    Route::put('/games/{gameId}/shuffler', [GameController::class, 'setInitialShuffler']);
    Route::get('/games/{gameId}/has-two-teams', [GameController::class, 'hasTwoTeams']);
    Route::post('/games/{gameId}/teams', [TeamController::class, 'store']);
    Route::put('/games/{gameId}/teams/{teamId}', [TeamController::class, 'update']);
    Route::post('/games/{gameId}/teams/{teamId}/attach', [TeamController::class, 'attach']);
    Route::post('/games/{gameId}/teams/{teamId}/players', [TeamPlayerController::class, 'store']);
    Route::delete('/games/{gameId}/teams/{teamId}/players/{playerId}', [TeamPlayerController::class, 'destroy']);
    Route::put('/games/{gameId}/players/swap-seats', [TeamPlayerController::class, 'swapSeats']);
    Route::post('/games/{gameId}/rounds', [RoundController::class, 'store']);
    Route::get('/games/{gameId}/round-draft', [RoundDraftController::class, 'show']);
    Route::put('/games/{gameId}/round-draft', [RoundDraftController::class, 'upsert']);
    Route::get('/games/{gameId}/rounds/{roundNumber}/draft', [RoundDraftController::class, 'showByRound']);

    Route::middleware('auth:sanctum')->group(function () {
        Route::get('/games', [GameController::class, 'index']);
        Route::post('/games', [GameController::class, 'store']);
        Route::delete('/games/{gameId}', [GameController::class, 'destroy']);
        Route::post('/games/{gameId}/rematch', [GameController::class, 'rematch']);

        Route::get('/invitations', [GameController::class, 'pendingInvitations']);

        Route::get('/games/{gameId}/invitable-users', [UserController::class, 'indexInvitable']);
        Route::post('/games/{gameId}/invitations', [GameController::class, 'storeInvitations']);
        Route::put('/games/{gameId}/invitation', [GameController::class, 'acceptInvitation']);

        Route::get('/user', function (Request $request) {
            return [
                'user' => $request->user(),
            ];
        });

        Route::get('/user/voice-aliases', [UserVoiceAliasController::class, 'index']);
        Route::post('/user/voice-aliases', [UserVoiceAliasController::class, 'store']);
        Route::delete('/user/voice-aliases/{aliasId}', [UserVoiceAliasController::class, 'destroy']);
    });
});
