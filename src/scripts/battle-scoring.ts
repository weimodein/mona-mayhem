export interface ContributionDay {
	date: string;
	count: number;
	level: number;
}

export interface ContributionWeek {
	firstDay: string;
	days: ContributionDay[];
}

export interface ContributionResponse {
	username: string;
	total: number;
	from: string;
	to: string;
	weeks: ContributionWeek[];
}

export interface PlayerBattleStats {
	total: number;
	longestStreak: number;
	currentStreak: number;
	peakCount: number;
	peakDates: string[];
	consistency: number;
}

export interface FighterClass {
	name: string;
	badge: string;
	description: string;
}

export const BATTLE_CATEGORIES = [
	'total',
	'longestStreak',
	'currentStreak',
	'peak',
	'consistency',
] as const;

type BattleCategory = (typeof BATTLE_CATEGORIES)[number];
type CategoryWinner = 'one' | 'two' | 'tie';

export interface BattleResult {
	playerOne: PlayerBattleStats;
	playerTwo: PlayerBattleStats;
	playerOneScore: number;
	playerTwoScore: number;
	categoryWinners: Record<BattleCategory, CategoryWinner>;
	winner: CategoryWinner;
}

const addDays = (date: string, amount: number): string => {
	const result = new Date(`${date}T00:00:00.000Z`);
	result.setUTCDate(result.getUTCDate() + amount);
	return result.toISOString().slice(0, 10);
};

const getDaysInRange = (data: ContributionResponse): ContributionDay[] =>
	data.weeks
		.flatMap((week) => week.days)
		.filter((day) => day.date >= data.from && day.date <= data.to)
		.sort((left, right) => left.date.localeCompare(right.date));

export const calculatePlayerStats = (data: ContributionResponse): PlayerBattleStats => {
	const days = getDaysInRange(data);
	const activeDays = days.filter((day) => day.count > 0).length;
	const rangeLength =
		(Date.parse(`${data.to}T00:00:00.000Z`) - Date.parse(`${data.from}T00:00:00.000Z`)) /
			86_400_000 +
		1;

	let longestStreak = 0;
	let currentRun = 0;
	let previousDate: string | undefined;

	for (const day of days) {
		if (day.count === 0) {
			currentRun = 0;
		} else {
			currentRun = previousDate === addDays(day.date, -1) ? currentRun + 1 : 1;
			longestStreak = Math.max(longestStreak, currentRun);
		}
		previousDate = day.date;
	}

	let currentStreak = 0;
	let expectedDate = data.to;
	for (let index = days.length - 1; index >= 0; index--) {
		const day = days[index];
		if (day.date !== expectedDate || day.count === 0) {
			break;
		}
		currentStreak++;
		expectedDate = addDays(expectedDate, -1);
	}

	const peakCount = days.reduce((peak, day) => Math.max(peak, day.count), 0);

	return {
		total: data.total,
		longestStreak,
		currentStreak,
		peakCount,
		peakDates:
			peakCount > 0
				? days.filter((day) => day.count === peakCount).map((day) => day.date)
				: [],
		consistency: rangeLength > 0 ? (activeDays / rangeLength) * 100 : 0,
	};
};

export const classifyFighter = (
	data: ContributionResponse,
	stats: PlayerBattleStats = calculatePlayerStats(data),
): FighterClass => {
	const days = getDaysInRange(data);
	const total = days.reduce((sum, day) => sum + day.count, 0);
	const weekendTotal = days.reduce((sum, day) => {
		const weekday = new Date(`${day.date}T00:00:00.000Z`).getUTCDay();
		return weekday === 0 || weekday === 6 ? sum + day.count : sum;
	}, 0);

	if (stats.longestStreak > 30) {
		return {
			name: 'Streak Paladin',
			badge: '🛡️',
			description: `${stats.longestStreak}-day longest streak`,
		};
	}

	if (total > 0 && weekendTotal / total >= 0.4) {
		return {
			name: 'Weekend Warrior',
			badge: '⚔️',
			description: `${Math.round((weekendTotal / total) * 100)}% of contributions landed on weekends`,
		};
	}

	if (stats.peakCount >= 10) {
		return {
			name: 'Commit Berserker',
			badge: '💥',
			description: `${stats.peakCount} contributions on a single day`,
		};
	}

	return {
		name: 'Arcade Adventurer',
		badge: '🕹️',
		description: 'A balanced contribution battle style',
	};
};

export const scoreBattle = (
	playerOne: ContributionResponse,
	playerTwo: ContributionResponse,
): BattleResult => {
	const statsOne = calculatePlayerStats(playerOne);
	const statsTwo = calculatePlayerStats(playerTwo);
	const categoryWinners = {} as Record<BattleCategory, CategoryWinner>;
	let playerOneScore = 0;
	let playerTwoScore = 0;

	for (const category of BATTLE_CATEGORIES) {
		const valueOne = category === 'peak' ? statsOne.peakCount : statsOne[category];
		const valueTwo = category === 'peak' ? statsTwo.peakCount : statsTwo[category];

		if (valueOne > valueTwo) {
			categoryWinners[category] = 'one';
			playerOneScore++;
		} else if (valueTwo > valueOne) {
			categoryWinners[category] = 'two';
			playerTwoScore++;
		} else {
			categoryWinners[category] = 'tie';
		}
	}

	return {
		playerOne: statsOne,
		playerTwo: statsTwo,
		playerOneScore,
		playerTwoScore,
		categoryWinners,
		winner:
			playerOneScore === playerTwoScore
				? 'tie'
				: playerOneScore > playerTwoScore
					? 'one'
					: 'two',
	};
};
