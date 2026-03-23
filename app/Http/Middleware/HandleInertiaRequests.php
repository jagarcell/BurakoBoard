<?php

namespace App\Http\Middleware;

use App\Repositories\BurakoGameRepository;
use Illuminate\Http\Request;
use Inertia\Middleware;

class HandleInertiaRequests extends Middleware
{
    /**
     * The root template that is loaded on the first page visit.
     *
     * @var string
     */
    protected $rootView = 'app';

    /**
     * Initialise the middleware with the game repository.
     *
     * @param  \App\Repositories\BurakoGameRepository  $gameRepository  Repository for game-related queries.
     * Logic: injects the repository so share() can query pending invitations without coupling the
     *   middleware to a global facade or inline query.
     */
    public function __construct(private BurakoGameRepository $gameRepository)
    {
    }

    /**
     * Determine the current asset version.
     */
    public function version(Request $request): ?string
    {
        return parent::version($request);
    }

    /**
     * Define the props that are shared by default.
     *
     * @param  \Illuminate\Http\Request  $request  The current HTTP request.
     * @return array<string, mixed> Shared props merged into every Inertia page.
     * Logic: propagates the authenticated user and, when a user is logged in, a boolean flag
     *   indicating whether they have any pending game invitations; the flag drives the nav-bar
     *   notification icon without requiring a separate API call from the frontend.
     */
    public function share(Request $request): array
    {
        $user = $request->user();

        return [
            ...parent::share($request),
            'auth' => [
                'user' => $user,
            ],
            'hasPendingInvitations' => $user
                ? $this->gameRepository->hasPendingInvitations($user->id)
                : false,
        ];
    }
}
