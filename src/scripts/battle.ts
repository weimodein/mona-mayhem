import {
	isSfxEnabled,
	playCoin,
	playPowerUp,
	playStatHit,
	playVictory,
	setSfxEnabled,
} from './battle-sfx';
import {
	BATTLE_CATEGORIES,
	classifyFighter,
	scoreBattle,
	type BattleResult,
	type ContributionDay,
	type ContributionResponse,
	type PlayerBattleStats,
} from './battle-scoring';

type BattleCategory = (typeof BATTLE_CATEGORIES)[number];

const COUNTDOWN_STAGES = ['3', '2', '1', 'FIGHT!'] as const;
const COUNTDOWN_STAGE_MS = 600;
const GRID_COLUMN_STAGGER_MS = 20;
const GRID_REVEAL_MS = 360;
const STAT_REVEAL_INTERVAL_MS = 400;

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null;

const isDate = (value: unknown): value is string => {
	if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
		return false;
	}

	const date = new Date(`${value}T00:00:00.000Z`);
	return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

const isContributionDay = (value: unknown): value is ContributionDay =>
	isRecord(value) &&
	isDate(value.date) &&
	typeof value.count === 'number' &&
	Number.isInteger(value.count) &&
	value.count >= 0 &&
	typeof value.level === 'number' &&
	Number.isInteger(value.level) &&
	value.level >= 0 &&
	value.level <= 4;

const isContributionResponse = (value: unknown): value is ContributionResponse =>
	isRecord(value) &&
	typeof value.username === 'string' &&
	typeof value.total === 'number' &&
	Number.isFinite(value.total) &&
	isDate(value.from) &&
	isDate(value.to) &&
	Array.isArray(value.weeks) &&
	value.weeks.length > 0 &&
	value.weeks.every(
		(week) =>
			isRecord(week) &&
			isDate(week.firstDay) &&
			Array.isArray(week.days) &&
			week.days.length === 7 &&
			week.days.every(isContributionDay),
	);

const requiredElement = <T extends HTMLElement>(selector: string): T => {
	const element = document.querySelector<T>(selector);
	if (!element) {
		throw new Error(`Missing battle arena element: ${selector}`);
	}
	return element;
};

const playerElement = <T extends HTMLElement>(
	card: HTMLElement,
	selector: string,
): T => {
	const element = card.querySelector<T>(selector);
	if (!element) {
		throw new Error(`Missing player card element: ${selector}`);
	}
	return element;
};

const createDayElement = (
	day: ContributionDay,
	weekIndex: number,
	dayIndex: number,
): HTMLSpanElement => {
	const element = document.createElement('span');
	element.className = 'contribution-day';
	element.dataset.level = String(day.level);
	element.style.setProperty(
		'--reveal-delay',
		`${weekIndex * GRID_COLUMN_STAGGER_MS + dayIndex * 4}ms`,
	);
	element.title = `${day.date}: ${day.count} contributions`;
	element.setAttribute('role', 'listitem');
	element.setAttribute('aria-label', `${day.date}: ${day.count} contributions`);
	return element;
};

const showSkeleton = (card: HTMLElement): void => {
	const calendar = playerElement<HTMLElement>(card, '[data-calendar-region]');
	const grid = playerElement<HTMLElement>(card, '[data-contribution-grid]');
	const skeleton = playerElement<HTMLElement>(card, '[data-loading-skeleton]');

	calendar.hidden = false;
	grid.hidden = true;
	skeleton.replaceChildren(
		...Array.from({ length: 53 * 7 }, () => {
			const day = document.createElement('span');
			day.className = 'contribution-day skeleton-day';
			return day;
		}),
	);
	skeleton.hidden = false;
};

const clearPlayer = (card: HTMLElement): void => {
	playerElement<HTMLElement>(card, '[data-username]').textContent = '';
	const fighterClass = playerElement<HTMLElement>(card, '[data-fighter-class]');
	fighterClass.textContent = '';
	fighterClass.hidden = true;
	for (const stat of card.querySelectorAll<HTMLElement>('[data-stat-value]')) {
		delete stat.dataset.result;
		delete stat.closest('tr')?.dataset.reveal;
		const value = playerElement<HTMLElement>(stat, '[data-stat-number]');
		value.textContent = '—';
		playerElement<HTMLElement>(stat, '[data-stat-points]').textContent = '';
	}
	playerElement<HTMLElement>(card, '[data-calendar-region]').hidden = true;
	const grid = playerElement<HTMLElement>(card, '[data-contribution-grid]');
	grid.replaceChildren();
	grid.hidden = false;
	const skeleton = playerElement<HTMLElement>(card, '[data-loading-skeleton]');
	skeleton.replaceChildren();
	skeleton.hidden = true;
};

const formatPeak = (stats: PlayerBattleStats): string =>
	stats.peakDates.length > 0
		? `${stats.peakCount.toLocaleString()} on ${stats.peakDates.join(', ')}`
		: 'No contributions';

const renderPlayer = (
	card: HTMLElement,
	data: ContributionResponse,
	stats: PlayerBattleStats,
	categoryWinners: BattleResult['categoryWinners'],
	player: 'one' | 'two',
): void => {
	playerElement<HTMLElement>(card, '[data-username]').textContent = data.username;
	const fighterClass = classifyFighter(data, stats);
	const fighterBadge = playerElement<HTMLElement>(card, '[data-fighter-class]');
	fighterBadge.textContent = `${fighterClass.badge} ${fighterClass.name}`;
	fighterBadge.title = fighterClass.description;
	fighterBadge.setAttribute('aria-label', `${fighterClass.name}: ${fighterClass.description}`);
	fighterBadge.hidden = false;

	const values: Record<BattleCategory, string> = {
		total: stats.total.toLocaleString(),
		longestStreak: `${stats.longestStreak} days`,
		currentStreak: `${stats.currentStreak} days`,
		peak: formatPeak(stats),
		consistency: `${stats.consistency.toFixed(1)}%`,
	};

	for (const category of BATTLE_CATEGORIES) {
		const stat = playerElement<HTMLElement>(card, `[data-stat-value="${category}"]`);
		stat.closest('tr')?.setAttribute('data-reveal', 'pending');
		playerElement<HTMLElement>(stat, '[data-stat-number]').textContent = values[category];
		const winner = categoryWinners[category];
		if (winner === 'tie') {
			stat.dataset.result = 'tie';
			playerElement<HTMLElement>(stat, '[data-stat-points]').textContent = 'Tie';
		} else if (winner === player) {
			stat.dataset.result = 'winner';
			playerElement<HTMLElement>(stat, '[data-stat-points]').textContent = '+1 point';
		} else {
			delete stat.dataset.result;
			playerElement<HTMLElement>(stat, '[data-stat-points]').textContent = '';
		}
	}

	const calendar = playerElement<HTMLElement>(card, '[data-calendar-region]');
	calendar.hidden = false;
	playerElement<HTMLElement>(card, '[data-date-range]').textContent =
		`${data.from} - ${data.to}`;

	const grid = playerElement<HTMLElement>(card, '[data-contribution-grid]');
	grid.classList.remove('is-revealing');
	grid.replaceChildren(
		...data.weeks.flatMap((week, weekIndex) =>
			week.days.map((day, dayIndex) => createDayElement(day, weekIndex, dayIndex)),
		),
	);
	grid.hidden = false;
	playerElement<HTMLElement>(card, '[data-loading-skeleton]').hidden = true;
};

const delay = (duration: number, signal: AbortSignal): Promise<void> =>
	new Promise((resolve, reject) => {
		if (signal.aborted) {
			reject(new DOMException('Battle sequence cancelled.', 'AbortError'));
			return;
		}

		const timeout = window.setTimeout(() => {
			signal.removeEventListener('abort', onAbort);
			resolve();
		}, duration);

		const onAbort = (): void => {
			window.clearTimeout(timeout);
			signal.removeEventListener('abort', onAbort);
			reject(new DOMException('Battle sequence cancelled.', 'AbortError'));
		};
		signal.addEventListener('abort', onAbort, { once: true });
	});

const runCountdown = async (
	overlay: HTMLElement,
	countdown: HTMLElement,
	signal: AbortSignal,
): Promise<void> => {
	overlay.hidden = false;
	for (const stage of COUNTDOWN_STAGES) {
		countdown.textContent = stage;
		countdown.dataset.stage = stage;
		countdown.style.animation = 'none';
		void countdown.offsetWidth;
		countdown.style.removeProperty('animation');
		await delay(COUNTDOWN_STAGE_MS, signal);
	}
	overlay.hidden = true;
};

const setHealth = (player: 'one' | 'two', health: number): void => {
	const value = requiredElement<HTMLOutputElement>(`[data-health-value="${player}"]`);
	const fill = requiredElement<HTMLElement>(`[data-health-fill="${player}"]`);
	const track = requiredElement<HTMLElement>(`[data-health-track="${player}"]`);
	value.value = `${health}%`;
	fill.style.width = `${health}%`;
	track.setAttribute('aria-valuenow', String(health));
};

const resetBattleEffects = (playerOne: string, playerTwo: string): void => {
	const scoreboard = requiredElement<HTMLElement>('[data-scoreboard]');
	scoreboard.removeAttribute('data-outcome');
	scoreboard.removeAttribute('data-celebrate');
	playerElement<HTMLElement>(scoreboard, '[data-winner-banner]').textContent = '';
	playerElement<HTMLElement>(scoreboard, '[data-score-one]').textContent = '0';
	playerElement<HTMLElement>(scoreboard, '[data-score-two]').textContent = '0';
	requiredElement<HTMLElement>('[data-health-name="one"]').textContent =
		playerOne ? playerOne.toUpperCase() : 'PLAYER 1';
	requiredElement<HTMLElement>('[data-health-name="two"]').textContent =
		playerTwo ? playerTwo.toUpperCase() : 'PLAYER 2';
	setHealth('one', 50);
	setHealth('two', 50);
	requiredElement<HTMLElement>('[data-fight-overlay]').hidden = true;
	requiredElement<HTMLElement>('.page-shell').classList.remove('screen-shake');
};

const revealGrid = async (card: HTMLElement, weekCount: number): Promise<void> => {
	const grid = playerElement<HTMLElement>(card, '[data-contribution-grid]');
	grid.classList.remove('is-revealing');
	void grid.offsetWidth;
	grid.classList.add('is-revealing');
	const duration =
		Math.max(0, weekCount - 1) * GRID_COLUMN_STAGGER_MS + GRID_REVEAL_MS + 100;
	await new Promise<void>((resolve) => window.setTimeout(resolve, duration));
};

const revealStats = async (
	battle: BattleResult,
	playerOneCard: HTMLElement,
	playerTwoCard: HTMLElement,
	scoreboard: HTMLElement,
	status: HTMLElement,
	signal: AbortSignal,
): Promise<void> => {
	let scoreOne = 0;
	let scoreTwo = 0;

	for (let index = 0; index < BATTLE_CATEGORIES.length; index++) {
		if (index > 0) {
			await delay(STAT_REVEAL_INTERVAL_MS, signal);
		}
		const category = BATTLE_CATEGORIES[index];
		playStatHit();
		for (const card of [playerOneCard, playerTwoCard]) {
			const row = playerElement<HTMLElement>(card, `[data-stat-row="${category}"]`);
			row.dataset.reveal = 'active';
		}

		const winner = battle.categoryWinners[category];
		if (winner === 'one') {
			scoreOne++;
		} else if (winner === 'two') {
			scoreTwo++;
		}
		playerElement<HTMLElement>(scoreboard, '[data-score-one]').textContent =
			String(scoreOne);
		playerElement<HTMLElement>(scoreboard, '[data-score-two]').textContent =
			String(scoreTwo);
		setHealth('one', 50 + (scoreOne - scoreTwo) * 10);
		setHealth('two', 50 + (scoreTwo - scoreOne) * 10);
		status.textContent = `ROUND ${index + 1} / ${BATTLE_CATEGORIES.length}`;
	}
};

const showVictory = (battle: BattleResult, dataOne: ContributionResponse, dataTwo: ContributionResponse) => {
	playVictory();
	const scoreboard = requiredElement<HTMLElement>('[data-scoreboard]');
	const banner = playerElement<HTMLElement>(scoreboard, '[data-winner-banner]');
	scoreboard.dataset.outcome = battle.winner === 'tie' ? 'tie' : 'victory';
	banner.textContent =
		battle.winner === 'tie'
			? "DOUBLE K.O.! IT'S A TIE!"
			: `K.O.! ${battle.winner === 'one' ? dataOne.username : dataTwo.username} WINS!`;

	const particles = playerElement<HTMLElement>(scoreboard, '[data-victory-particles]');
	particles.replaceChildren(
		...Array.from({ length: 12 }, (_, index) => {
			const particle = document.createElement('span');
			particle.style.setProperty('--particle-delay', `${index * 24}ms`);
			return particle;
		}),
	);
	scoreboard.dataset.celebrate = 'true';
	const page = requiredElement<HTMLElement>('.page-shell');
	page.classList.remove('screen-shake');
	void page.offsetWidth;
	page.classList.add('screen-shake');
};

const getApiError = async (response: Response, username: string): Promise<string> => {
	if (response.status === 404) {
		return `GitHub user "${username}" was not found. Check the username and try again.`;
	}

	try {
		const body: unknown = await response.json();
		if (isRecord(body) && typeof body.error === 'string') {
			return body.error;
		}
	} catch {
		// Fall back to the HTTP status when the server response is not JSON.
	}

	return `Could not load "${username}" (HTTP ${response.status}). Please try again.`;
};

export const initializeBattleArena = (): void => {
	const form = requiredElement<HTMLFormElement>('[data-battle-form]');
	const button = requiredElement<HTMLButtonElement>('[data-battle-button]');
	const status = requiredElement<HTMLElement>('[data-battle-status]');
	const playerOneCard = requiredElement<HTMLElement>('[data-player-card="one"]');
	const playerTwoCard = requiredElement<HTMLElement>('[data-player-card="two"]');
	const scoreboard = requiredElement<HTMLElement>('[data-scoreboard]');
	const playerOneInput = requiredElement<HTMLInputElement>('#player-one');
	const playerTwoInput = requiredElement<HTMLInputElement>('#player-two');
	const readyIndicator = requiredElement<HTMLElement>('[data-ready-indicator]');
	const fightOverlay = requiredElement<HTMLElement>('[data-fight-overlay]');
	const fightCountdown = requiredElement<HTMLElement>('[data-fight-countdown]');
	const sfxToggle = requiredElement<HTMLButtonElement>('[data-sfx-toggle]');
	const presetButtons = form.querySelectorAll<HTMLButtonElement>(
		'[data-preset-one][data-preset-two]',
	);
	let presetTriggeredSubmit = false;

	for (const input of [playerOneInput, playerTwoInput]) {
		input.addEventListener('invalid', () => {
			input.setAttribute('aria-invalid', 'true');
		});
		input.addEventListener('input', () => {
			if (input.value.trim()) {
				input.setAttribute('aria-invalid', 'false');
			}
		});
	}

	const updateSfxToggle = (): void => {
		const sfxEnabled = isSfxEnabled();
		sfxToggle.textContent = sfxEnabled ? '🔊 SFX: ON' : '🔇 SFX: OFF';
		sfxToggle.setAttribute('aria-pressed', String(sfxEnabled));
		sfxToggle.setAttribute(
			'aria-label',
			sfxEnabled ? 'Mute sound effects' : 'Enable sound effects',
		);
	};

	sfxToggle.addEventListener('click', () => {
		setSfxEnabled(!isSfxEnabled());
		updateSfxToggle();
	});
	updateSfxToggle();

	for (const preset of presetButtons) {
		preset.addEventListener('click', () => {
			const { presetOne, presetTwo } = preset.dataset;
			if (!presetOne || !presetTwo) {
				return;
			}

			playerOneInput.value = presetOne;
			playerTwoInput.value = presetTwo;
			playCoin();
			presetTriggeredSubmit = true;
			form.requestSubmit();
		});
	}

	form.addEventListener('submit', async (event) => {
		event.preventDefault();
		if (presetTriggeredSubmit) {
			presetTriggeredSubmit = false;
		} else {
			playCoin();
		}

		const formData = new FormData(form);
		const playerOne = String(formData.get('playerOne') ?? '').trim();
		const playerTwo = String(formData.get('playerTwo') ?? '').trim();
		playerOneInput.setAttribute('aria-invalid', String(!playerOne));
		playerTwoInput.setAttribute('aria-invalid', String(!playerTwo));
		const shareUrl = new URL(window.location.href);
		if (playerOne && playerTwo) {
			shareUrl.searchParams.set('p1', playerOne);
			shareUrl.searchParams.set('p2', playerTwo);
		} else {
			shareUrl.searchParams.delete('p1');
			shareUrl.searchParams.delete('p2');
		}
		window.history.replaceState(window.history.state, '', shareUrl);
		resetBattleEffects(playerOne, playerTwo);
		status.hidden = true;
		status.textContent = '';
		readyIndicator.hidden = true;
		scoreboard.hidden = true;
		clearPlayer(playerOneCard);
		clearPlayer(playerTwoCard);

		if (!playerOne || !playerTwo) {
			status.dataset.state = 'error';
			status.textContent = 'Enter a GitHub username for both players.';
			status.hidden = false;
			return;
		}

		button.disabled = true;
		for (const preset of presetButtons) {
			preset.disabled = true;
		}
		status.dataset.state = 'loading';
		status.textContent = 'CHALLENGERS APPROACHING...';
		status.hidden = false;
		showSkeleton(playerOneCard);
		showSkeleton(playerTwoCard);
		playPowerUp();

		const countdownController = new AbortController();
		try {
			const usernames = [playerOne, playerTwo];
			const requestPromise = Promise.all(
				usernames.map((username) =>
					fetch(`/api/contributions/${encodeURIComponent(username)}`),
				),
			).then(async (responses) => {
				const failedIndex = responses.findIndex((response) => !response.ok);
				if (failedIndex !== -1) {
					throw new Error(
						await getApiError(responses[failedIndex], usernames[failedIndex]),
					);
				}

				const payloads: unknown[] = await Promise.all(
					responses.map((response) => response.json()),
				);
				const [dataOne, dataTwo] = payloads;
				if (!isContributionResponse(dataOne) || !isContributionResponse(dataTwo)) {
					throw new Error(
						'The server returned contribution data in an unexpected format.',
					);
				}
				return [dataOne, dataTwo] as const;
			});
			const [, [dataOne, dataTwo]] = await Promise.all([
				runCountdown(fightOverlay, fightCountdown, countdownController.signal),
				requestPromise,
			]);
			const battle = scoreBattle(dataOne, dataTwo);
			renderPlayer(playerOneCard, dataOne, battle.playerOne, battle.categoryWinners, 'one');
			renderPlayer(playerTwoCard, dataTwo, battle.playerTwo, battle.categoryWinners, 'two');

			scoreboard.hidden = false;
			scoreboard.dataset.outcome = 'battle';
			playerElement<HTMLElement>(scoreboard, '[data-winner-banner]').textContent =
				'FIGHT IN PROGRESS!';
			status.textContent = 'Revealing contribution calendars...';
			await Promise.all([
				revealGrid(playerOneCard, dataOne.weeks.length),
				revealGrid(playerTwoCard, dataTwo.weeks.length),
			]);
			await revealStats(
				battle,
				playerOneCard,
				playerTwoCard,
				scoreboard,
				status,
				countdownController.signal,
			);
			showVictory(battle, dataOne, dataTwo);
			status.hidden = true;
		} catch (error) {
			countdownController.abort();
			fightOverlay.hidden = true;
			clearPlayer(playerOneCard);
			clearPlayer(playerTwoCard);
			scoreboard.hidden = true;
			resetBattleEffects('', '');
			status.dataset.state = 'error';
			status.textContent =
				error instanceof Error
					? error.message
					: 'Unable to load contribution calendars. Please try again.';
			status.hidden = false;
		} finally {
			button.disabled = false;
			for (const preset of presetButtons) {
				preset.disabled = false;
			}
		}
	});

	const sharedUrl = new URL(window.location.href);
	const sharedPlayerOne = sharedUrl.searchParams.get('p1');
	const sharedPlayerTwo = sharedUrl.searchParams.get('p2');
	if (sharedPlayerOne !== null && sharedPlayerTwo !== null) {
		playerOneInput.value = sharedPlayerOne;
		playerTwoInput.value = sharedPlayerTwo;
		form.requestSubmit();
	}
};
