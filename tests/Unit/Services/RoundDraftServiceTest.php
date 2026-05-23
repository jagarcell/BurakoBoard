<?php

namespace Tests\Unit\Services;

use App\Enums\GameStatus;
use App\Events\RoundDraftUpdated;
use App\Models\Game;
use App\Models\RoundDraft;
use App\Repositories\GameRepository;
use App\Repositories\RoundDraftRepository;
use App\Services\RoundDraftService;
use Illuminate\Validation\ValidationException;
use Mockery;
use Mockery\MockInterface;
use Tests\TestCase;

class RoundDraftServiceTest extends TestCase
{
    private GameRepository&MockInterface $gameRepository;
    private RoundDraftRepository&MockInterface $roundDraftRepository;
    private RoundDraftService $service;

    protected function setUp(): void
    {
        parent::setUp();

        $this->gameRepository       = Mockery::mock(GameRepository::class);
        $this->roundDraftRepository = Mockery::mock(RoundDraftRepository::class);

        $this->service = new RoundDraftService(
            $this->gameRepository,
            $this->roundDraftRepository,
        );
    }

    public function test_get_round_draft_verifies_game_exists_and_returns_draft(): void
    {
        $game  = new Game();
        $draft = new RoundDraft();

        $this->gameRepository->shouldReceive('findGameOrFail')
            ->once()
            ->with(1)
            ->andReturn($game);

        $this->roundDraftRepository->shouldReceive('getRoundDraft')
            ->once()
            ->with(1)
            ->andReturn($draft);

        $result = $this->service->getRoundDraft(1);

        $this->assertSame($draft, $result);
    }

    public function test_get_round_draft_returns_null_when_no_draft_exists(): void
    {
        $game = new Game();

        $this->gameRepository->shouldReceive('findGameOrFail')
            ->once()
            ->with(1)
            ->andReturn($game);

        $this->roundDraftRepository->shouldReceive('getRoundDraft')
            ->once()
            ->with(1)
            ->andReturn(null);

        $result = $this->service->getRoundDraft(1);

        $this->assertNull($result);
    }

    public function test_get_round_draft_for_round_verifies_game_and_returns_archived_draft(): void
    {
        $game  = new Game();
        $draft = new RoundDraft();

        $this->gameRepository->shouldReceive('findGameOrFail')
            ->once()
            ->with(1)
            ->andReturn($game);

        $this->roundDraftRepository->shouldReceive('getRoundDraftForRound')
            ->once()
            ->with(1, 3)
            ->andReturn($draft);

        $result = $this->service->getRoundDraftForRound(1, 3);

        $this->assertSame($draft, $result);
    }

    public function test_save_round_draft_throws_when_game_is_finished(): void
    {
        $game         = new Game();
        $game->status = GameStatus::Finished;

        $this->gameRepository->shouldReceive('findGameOrFail')
            ->once()
            ->with(1)
            ->andReturn($game);

        $this->expectException(ValidationException::class);

        $this->service->saveRoundDraft(1, ['base_inputs' => [], 'card_inputs' => []]);
    }

    public function test_save_round_draft_upserts_and_broadcasts(): void
    {

        $game         = new Game();
        $game->status = GameStatus::InProgress;
        $game->current_round_number = 0;

        $draft              = new RoundDraft();
        $draft->game_id     = 1;
        $draft->base_inputs = ['a' => 1];
        $draft->card_inputs = ['b' => 2];

        $this->gameRepository->shouldReceive('findGameOrFail')
            ->once()
            ->with(1)
            ->andReturn($game);

        $this->roundDraftRepository->shouldReceive('upsertRoundDraft')
            ->once()
            ->with(1, ['a' => 1], ['b' => 2])
            ->andReturn($draft);

        $result = $this->service->saveRoundDraft(1, ['base_inputs' => ['a' => 1], 'card_inputs' => ['b' => 2]]);

        $this->assertSame($draft, $result);
    }

    /**
     * saveRoundDraft rejects stale payloads when expected_current_round_number mismatches.
     *
     * @return void
     * Logic: when a delayed PUT arrives after the game advanced to a newer round,
     *   the service must throw a validation error and skip repository persistence.
     */
    public function test_save_round_draft_throws_when_expected_round_number_is_stale(): void
    {
        $game = new Game();
        $game->status = GameStatus::InProgress;
        $game->current_round_number = 1;

        $this->gameRepository->shouldReceive('findGameOrFail')
            ->once()
            ->with(1)
            ->andReturn($game);

        $this->roundDraftRepository->shouldNotReceive('upsertRoundDraft');

        $this->expectException(ValidationException::class);

        $this->service->saveRoundDraft(1, [
            'base_inputs' => ['a' => 1],
            'card_inputs' => ['b' => 2],
            'expected_current_round_number' => 0,
        ]);
    }

    /**
     * saveRoundDraft allows persistence when expected_current_round_number matches.
     *
     * @return void
     * Logic: validates the optimistic guard is non-blocking for non-stale requests.
     */
    public function test_save_round_draft_allows_when_expected_round_number_matches(): void
    {
        $game = new Game();
        $game->status = GameStatus::InProgress;
        $game->current_round_number = 2;

        $draft = new RoundDraft();
        $draft->game_id = 1;
        $draft->base_inputs = ['x' => true];
        $draft->card_inputs = ['y' => 3];

        $this->gameRepository->shouldReceive('findGameOrFail')
            ->once()
            ->with(1)
            ->andReturn($game);

        $this->roundDraftRepository->shouldReceive('upsertRoundDraft')
            ->once()
            ->with(1, ['x' => true], ['y' => 3])
            ->andReturn($draft);

        $result = $this->service->saveRoundDraft(1, [
            'base_inputs' => ['x' => true],
            'card_inputs' => ['y' => 3],
            'expected_current_round_number' => 2,
        ]);

        $this->assertSame($draft, $result);
    }

    public function test_delete_round_draft_verifies_game_exists_and_deletes_draft(): void
    {
        $game = new Game();

        $this->gameRepository->shouldReceive('findGameOrFail')
            ->once()
            ->with(1)
            ->andReturn($game);

        $this->roundDraftRepository->shouldReceive('deleteRoundDraft')
            ->once()
            ->with(1);

        $this->service->deleteRoundDraft(1);
    }

    public function test_delete_round_draft_raises_model_not_found_for_unknown_game(): void
    {
        $this->gameRepository->shouldReceive('findGameOrFail')
            ->once()
            ->with(99999)
            ->andThrow(new \Illuminate\Database\Eloquent\ModelNotFoundException());

        $this->expectException(\Illuminate\Database\Eloquent\ModelNotFoundException::class);

        $this->service->deleteRoundDraft(99999);
    }
}
