<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Repositories\InvitationRepository;
use App\Services\InvitationService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class InvitationAcceptController extends Controller
{
    public function __construct(
        private readonly InvitationRepository $invitationRepository,
        private readonly InvitationService $invitationService,
    )
    {
    }

    /**
     * Accept an email-based invitation via token, creating a guest user if necessary
     * and logging them in.
     *
     * @param  Request  $request
     * @return RedirectResponse
     * Logic: validate token, ensure not expired/used, create-or-find user, mark invitation used, then Auth::login()
     */
    public function accept(Request $request): RedirectResponse
    {
        $token = $request->query('token');

        if (empty($token)) {
            return redirect('/')->with('error', 'Invalid invitation link.');
        }

        $invitation = $this->invitationRepository->findByToken($token);

        if (! $invitation) {
            return redirect('/')->with('error', 'Invitation not found or expired.');
        }

        if ($invitation->used_at) {
            return redirect('/')->with('error', 'This invitation link has already been used.');
        }

        if ($invitation->expires_at && $invitation->expires_at->isPast()) {
            return redirect('/')->with('error', 'This invitation link has expired.');
        }

        $email = $invitation->email;

        $user = User::where('email', $email)->first();

        if (! $user) {
            $user = User::create([
                'name' => $email,
                'email' => $email,
                'password' => Hash::make(uniqid() . Str::random(16)),
                'is_guest' => true,
                'invited_by_id' => $invitation->inviter_id,
                'invited_at' => now(),
                'email_verified_at' => now(),
            ]);
        }

        // mark the invitation used
        $this->invitationRepository->markInvitationUsed($invitation);

        Auth::login($user);

        // If the invitation targeted a specific game, attempt to accept any pending pivot and
        // redirect the user to the dashboard with the game pre-selected.
        if ($invitation->game_id) {
            $accepted = $this->invitationService->acceptInvitationIfPending((int) $invitation->game_id, (int) $user->id);

            if (! $accepted) {
                // No pending pivot existed (email invite path). Ensure the user is attached
                // to the game as a viewer so the dashboard shows the game in the selector.
                $this->invitationRepository->attachViewerToGameIfMissing((int) $invitation->game_id, (int) $user->id);
            }

            return redirect()->to(route('dashboard', ['game' => $invitation->game_id]));
        }

        return redirect('/dashboard');
    }
}
