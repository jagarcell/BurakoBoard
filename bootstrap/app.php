<?php

use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        channels: __DIR__.'/../routes/channels.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->trustProxies(at: '*');

        // Apple Sign In POSTs to the callback URI from its own servers;
        // exclude that URL from CSRF verification.
        $middleware->validateCsrfTokens(except: [
            'auth/apple/callback',
        ]);

        $middleware->statefulApi();

        $middleware->api(append: [
            \App\Http\Middleware\EnsureApiResponseEnvelope::class,
        ]);

        $middleware->web(append: [
            \App\Http\Middleware\HandleInertiaRequests::class,
            \Illuminate\Http\Middleware\AddLinkHeadersForPreloadedAssets::class,
        ]);

        //
    })
    ->withExceptions(function (Exceptions $exceptions): void {

        // Prevent sensitive values from being flashed into error sessions.
        $exceptions->dontFlash(['password', 'password_confirmation', 'token', 'secret']);

        // Return a clean 404 JSON for API callers instead of Laravel's raw prose.
        // Note: Laravel's prepareException() converts ModelNotFoundException to
        // NotFoundHttpException before renderables run, so we catch the latter.
        $exceptions->renderable(function (NotFoundHttpException $e, Request $request) {
            if ($request->expectsJson()) {
                return response()->json([
                    'message' => 'The requested resource was not found.',
                    'errors'  => (object) [],
                ], 404);
            }
        });

        // Standardise the error data shape for all non-validation JSON errors so
        // every error response always contains both 'message' and 'errors' keys.
        $exceptions->renderable(function (\Throwable $e, Request $request) {
            if ($request->expectsJson()
                && ! ($e instanceof ValidationException)
                && ! ($e instanceof AuthenticationException)
                && ! ($e instanceof AuthorizationException)) {
                $status  = method_exists($e, 'getStatusCode') ? $e->getStatusCode() : 500;
                $message = $status < 500 ? $e->getMessage() : 'A server error occurred.';

                return response()->json([
                    'message' => $message,
                    'errors'  => (object) [],
                ], $status);
            }
        });

        // Log unhandled server exceptions with a correlation ID for production tracing.
        $exceptions->reportable(function (\Throwable $e) {
            if (! ($e instanceof ValidationException) &&
                ! ($e instanceof ModelNotFoundException) &&
                ! ($e instanceof AuthorizationException)) {

                $correlationId = (string) Str::uuid();
                Log::error('Unhandled exception', [
                    'correlation_id' => $correlationId,
                    'exception'      => get_class($e),
                    'message'        => $e->getMessage(),
                    'file'           => $e->getFile(),
                    'line'           => $e->getLine(),
                    'url'            => request()->fullUrl(),
                    'method'         => request()->method(),
                    'user_id'        => auth()->id(),
                ]);
            }
        });

    })->create();
