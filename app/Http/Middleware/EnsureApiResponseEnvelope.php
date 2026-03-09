<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureApiResponseEnvelope
{
    /**
     * Transform API JSON responses into a consistent envelope structure.
     *
     * @param  \Illuminate\Http\Request  $request  The current HTTP request used to derive URL and API version metadata.
     * @param  \Closure(\Illuminate\Http\Request): (\Symfony\Component\HttpFoundation\Response)  $next  The next middleware/controller action in the request pipeline.
     * @return \Symfony\Component\HttpFoundation\Response The original response when already normalized, otherwise a JSON response with status, data, meta, links, and http_code.
     */
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        if (! $response instanceof JsonResponse) {
            return $response;
        }

        $payload = $response->getData(true);
        $statusCode = $response->getStatusCode();

        $hasEnvelope = is_array($payload)
            && array_key_exists('status', $payload)
            && array_key_exists('data', $payload)
            && array_key_exists('meta', $payload)
            && array_key_exists('links', $payload)
            && array_key_exists('http_code', $payload);

        if ($hasEnvelope) {
            return $response;
        }

        return response()->json([
            'status' => $statusCode >= 400 ? 'error' : 'success',
            'data' => $payload,
            'meta' => [
                'version' => $request->segment(2),
            ],
            'links' => [
                'self' => $request->fullUrl(),
            ],
            'http_code' => $statusCode,
        ], $statusCode);
    }
}
