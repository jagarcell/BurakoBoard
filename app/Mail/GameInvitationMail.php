<?php

namespace App\Mail;

use App\Models\Game;
use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class GameInvitationMail extends Mailable
{
    use Queueable, SerializesModels;

    /**
     * Create a new game invitation mailable instance.
     *
     * @param  \App\Models\Game  $game     The game the recipient is being invited to watch.
     * @param  \App\Models\User  $invitee  The user receiving the invitation.
     * @param  \App\Models\User  $inviter  The user (creator) who sent the invitation.
     * @return void Stores all context needed to render the email view.
     * Logic: accept the game, the target user, and the sender as constructor dependencies;
     *   SerializesModels handles model serialization for queued dispatch automatically.
     */
    public function __construct(
        public readonly Game $game,
        public readonly User $invitee,
        public readonly User $inviter,
    ) {
    }

    /**
     * Get the message envelope.
     *
     * @return \Illuminate\Mail\Mailables\Envelope Email subject and address metadata.
     * Logic: use a descriptive subject that mentions the game name so recipients immediately
     *   understand the purpose of the email.
     */
    public function envelope(): Envelope
    {
        return new Envelope(
            subject: "You've been invited to watch {$this->game->name} on BurakoBoard",
        );
    }

    /**
     * Get the message content definition.
     *
     * @return \Illuminate\Mail\Mailables\Content The Blade view to render for the email body.
     * Logic: render the dedicated email view; all public properties on this class are automatically
     *   available as variables inside the Blade template.
     */
    public function content(): Content
    {
        return new Content(
            view: 'emails.game-invitation',
        );
    }
}
