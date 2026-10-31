import assert from 'node:assert/strict';
import test from 'node:test';
import { GET, normalizeContributions } from '../src/pages/api/contributions/[username].ts';

const makeUpstreamPayload = () => ({
	schema: 'v2',
	from: '2025-01-05',
	to: '2025-01-11',
	total_contributions: 3,
	weeks: [
		{
			first_day: '2025-01-05',
			contribution_days: [
				{ weekday: 0, count: 0, level: 0 },
				{ weekday: 1, count: 1, level: 1 },
				{ weekday: 2, count: 0, level: 0 },
				{ weekday: 3, count: 2, level: 2 },
				{ weekday: 4, count: 0, level: 0 },
				{ weekday: 5, count: 0, level: 0 },
				{ weekday: 6, count: 0, level: 0 },
			],
		},
	],
});

test('contribution parser normalizes upstream weekdays into dated days', () => {
	const normalized = normalizeContributions('sample-user', makeUpstreamPayload());

	assert.equal(normalized.username, 'sample-user');
	assert.equal(normalized.total, 3);
	assert.equal(normalized.weeks[0].firstDay, '2025-01-05');
	assert.deepEqual(
		normalized.weeks[0].days.map(({ date, count }) => [date, count]),
		[
			['2025-01-05', 0],
			['2025-01-06', 1],
			['2025-01-07', 0],
			['2025-01-08', 2],
			['2025-01-09', 0],
			['2025-01-10', 0],
			['2025-01-11', 0],
		],
	);
});

test('contribution parser rejects out-of-order upstream weekdays', () => {
	const payload = makeUpstreamPayload();
	payload.weeks[0].contribution_days[0].weekday = 1;

	assert.throws(
		() => normalizeContributions('sample-user', payload),
		{ message: 'Contribution weekdays are out of order' },
	);
});

test('API route rejects invalid GitHub usernames without making an upstream request', async () => {
	const invalidUsernames = [
		'',
		'-leading-hyphen',
		'trailing-hyphen-',
		'double--hyphen',
		'with.dot',
		'has/slash',
		'has space',
		'a'.repeat(40),
	];
	const originalFetch = globalThis.fetch;
	let fetchCalls = 0;
	globalThis.fetch = async () => {
		fetchCalls++;
		throw new Error('Invalid usernames must not reach GitHub');
	};

	try {
		for (const username of invalidUsernames) {
			const response = await GET({ params: { username } });
			assert.equal(response.status, 400, `expected ${JSON.stringify(username)} to be rejected`);
			assert.deepEqual(await response.json(), { error: 'Invalid GitHub username' });
		}
		assert.equal(fetchCalls, 0);

		const missingUsernameResponse = await GET({ params: {} });
		assert.equal(missingUsernameResponse.status, 400);
	} finally {
		globalThis.fetch = originalFetch;
	}
});
