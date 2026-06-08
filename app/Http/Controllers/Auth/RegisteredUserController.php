<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\InvitationService;
use Illuminate\Auth\Events\Registered;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Validation\Rules;
use Inertia\Inertia;
use Inertia\Response;

class RegisteredUserController extends Controller
{
    public function __construct(private readonly InvitationService $invitations) {}

    /**
     * Display the registration view.
     *
     * @param Request $request
     * @return Response
     * Logic: Render the registration page and optionally preserve an invitation
     * game id in session when the link contains `game` and `email` query params.
     */
    public function create(Request $request): Response
    {
        if ($request->filled('game') && $request->filled('email')) {
            redirect()->setIntendedUrl(route('dashboard', absolute: false) . '?game=' . rawurlencode((string) $request->query('game')));
            session(['invitation_game_id' => (int) $request->query('game')]);
        }

        return Inertia::render('Auth/Register', [
            'email' => $request->query('email', ''),
        ]);
    }

    /**
     * Handle an incoming registration request.
     *
     * @param Request $request
     * @return RedirectResponse
     * @throws \Illuminate\Validation\ValidationException
     * Logic: Validate input and create a new user. If an account already
     * exists with `is_guest = 1`, send a password reset link to allow the
     * guest to claim the account instead of creating a duplicate.
     */
    public function store(Request $request): RedirectResponse
    {
        $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|string|lowercase|email|max:255',
            'password' => ['required', 'confirmed', Rules\Password::defaults()],
        ]);

        $existing = User::where('email', $request->email)->first();

        if ($existing) {
            if ($existing->is_guest) {
                // Claim the guest account: update name, password and clear guest flag.
                $existing->name = $request->name;
                $existing->password = Hash::make($request->password);
                $existing->is_guest = false;
                $existing->save();

                event(new Registered($existing));

                Auth::login($existing);

                // Regenerate session and accept any pending invitation like normal flow.
                $request->session()->regenerate();

                $invitationGameId = $request->session()->pull('invitation_game_id');

                if ($invitationGameId) {
                    $this->invitations->acceptInvitationIfPending((int) $invitationGameId, (int) auth()->id());
                }

                return redirect()->intended(route('dashboard', absolute: false));
            }

            return back()->withErrors(['email' => 'The email has already been taken.']);
        }

        $user = User::create([
            'name' => $request->name,
            'email' => $request->email,
            'password' => Hash::make($request->password),
        ]);

        event(new Registered($user));

        Auth::login($user);

        // Regenerate session to prevent fixation, then handle any invitation that
        // was primed in the session (visit via email link). If present, silently
        // accept the pending invitation so the newly-registered user becomes a viewer.
        $request->session()->regenerate();

        $invitationGameId = $request->session()->pull('invitation_game_id');

        if ($invitationGameId) {
            $this->invitations->acceptInvitationIfPending((int) $invitationGameId, (int) auth()->id());
        }

        return redirect()->intended(route('dashboard', absolute: false));
    }
}
