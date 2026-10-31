import assert from 'node:assert/strict';
import test from 'node:test';
import { calculatePlayerStats, scoreBattle } from '../src/scripts/battle-scoring.ts';

const makeContributionResponse = (username, from, counts) => {
	const days = counts.map((count, index) => {
		const date = new Date(Date.parse(`${from}T00:00:00.000Z`) + index * 86_400_000)
			.toISOString()
			.slice(0, 10);
		return { date, count, level: count === 0 ? 0 : 1 };
	});

	const weeks = [];
	for (let index = 0; index < days.length; index += 7) {
		const weekDays = days.slice(index, index + 7);
		while (weekDays.length < 7) {
			const date = new Date(
				Date.parse(`${from}T00:00:00.000Z`) +
					(index + weekDays.length) * 86_400_000,
			)
				.toISOString()
				.slice(0, 10);
			weekDays.push({ date, count: 0, level: 0 });
		}
		weeks.push({ firstDay: weekDays[0].date, days: weekDays });
	}

	return {
		username,
		total: counts.reduce((sum, count) => sum + count, 0),
		from,
		to: days.at(-1).date,
		weeks,
	};
};

test('a player with no contributions all year has zero stats', () => {
	const counts = Array(366).fill(0);
	const response = makeContributionResponse('quiet-player', '2024-01-01', counts);

	assert.deepEqual(calculatePlayerStats(response), {
		total: 0,
		longestStreak: 0,
		currentStreak: 0,
		peakCount: 0,
		peakDates: [],
		consistency: 0,
	});
});

test('longest streak continues across month and year boundaries', () => {
	const response = makeContributionResponse('streak-player', '2024-12-29', [
		1, 1, 1, 1, 1, 1,
	]);

	const stats = calculatePlayerStats(response);
	assert.equal(stats.longestStreak, 6);
	assert.equal(stats.currentStreak, 6);
});

test('identical player stats produce a category tie and an overall tie', () => {
	const counts = [2, 0, 1, 3, 0, 4, 1];
	const result = scoreBattle(
		makeContributionResponse('player-one', '2025-02-01', counts),
		makeContributionResponse('player-two', '2025-02-01', counts),
	);

	assert.equal(result.winner, 'tie');
	assert.equal(result.playerOneScore, 0);
	assert.equal(result.playerTwoScore, 0);
	assert.deepEqual(Object.values(result.categoryWinners), Array(5).fill('tie'));
	assert.deepEqual(result.playerOne, result.playerTwo);
});
