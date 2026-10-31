import type { APIRoute } from 'astro';

export const prerender = false;

interface ContributionDay {
	date: string;
	count: number;
	level: number;
}

interface ContributionWeek {
	firstDay: string;
	days: ContributionDay[];
}

interface UpstreamContributionDay {
	weekday: number;
	count: number;
	level: number;
}

interface UpstreamContributionWeek {
	first_day: string;
	contribution_days: UpstreamContributionDay[];
}

interface UpstreamContributions {
	schema: string;
	from: string;
	to: string;
	total_contributions: number;
	weeks: UpstreamContributionWeek[];
}

class InvalidUpstreamDataError extends Error {}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null;

const isDate = (value: unknown): value is string => {
	if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
		return false;
	}

	const date = new Date(`${value}T00:00:00.000Z`);
	return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

const isUpstreamDay = (value: unknown): value is UpstreamContributionDay =>
	isRecord(value) &&
	Number.isInteger(value.weekday) &&
	typeof value.weekday === 'number' &&
	value.weekday >= 0 &&
	value.weekday <= 6 &&
	Number.isInteger(value.count) &&
	typeof value.count === 'number' &&
	value.count >= 0 &&
	Number.isInteger(value.level) &&
	typeof value.level === 'number' &&
	value.level >= 0 &&
	value.level <= 4;

const isUpstreamWeek = (value: unknown): value is UpstreamContributionWeek =>
	isRecord(value) &&
	isDate(value.first_day) &&
	Array.isArray(value.contribution_days) &&
	value.contribution_days.length === 7 &&
	value.contribution_days.every(isUpstreamDay);

const isUpstreamContributions = (value: unknown): value is UpstreamContributions =>
	isRecord(value) &&
	value.schema === 'v2' &&
	isDate(value.from) &&
	isDate(value.to) &&
	Number.isInteger(value.total_contributions) &&
	typeof value.total_contributions === 'number' &&
	value.total_contributions >= 0 &&
	Array.isArray(value.weeks) &&
	value.weeks.length > 0 &&
	value.weeks.every(isUpstreamWeek);

export const normalizeContributions = (
	username: string,
	payload: unknown,
): { username: string; total: number; from: string; to: string; weeks: ContributionWeek[] } => {
	if (!isUpstreamContributions(payload)) {
		throw new InvalidUpstreamDataError('Unexpected contribution response format');
	}

	const weeks = payload.weeks.map((week) => {
		const firstDay = new Date(`${week.first_day}T00:00:00.000Z`);
		const days = week.contribution_days.map((day, index) => {
			if (day.weekday !== index) {
				throw new InvalidUpstreamDataError('Contribution weekdays are out of order');
			}

			const date = new Date(firstDay);
			date.setUTCDate(date.getUTCDate() + day.weekday);

			return {
				date: date.toISOString().slice(0, 10),
				count: day.count,
				level: day.level,
			};
		});

		return { firstDay: week.first_day, days };
	});

	return {
		username,
		total: payload.total_contributions,
		from: payload.from,
		to: payload.to,
		weeks,
	};
};

const jsonResponse = (body: object, status: number, cache = false): Response =>
	new Response(JSON.stringify(body), {
		status,
		headers: {
			'Content-Type': 'application/json; charset=utf-8',
			...(cache ? { 'Cache-Control': 'public, max-age=300' } : {}),
		},
	});

export const GET: APIRoute = async ({ params }) => {
	const { username } = params;

	if (
		!username ||
		username.length > 39 ||
		!/^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/.test(username)
	) {
		return jsonResponse({ error: 'Invalid GitHub username' }, 400);
	}

	let upstreamResponse: Response;
	try {
		upstreamResponse = await fetch(`https://github.com/${encodeURIComponent(username)}.contribs`, {
			headers: { Accept: 'application/json' },
		});
	} catch (error) {
		console.error('Failed to fetch GitHub contributions', error);
		return jsonResponse({ error: 'Failed to retrieve contribution data' }, 502);
	}

	if (upstreamResponse.status === 404) {
		return jsonResponse({ error: 'GitHub user not found' }, 404);
	}

	if (!upstreamResponse.ok) {
		console.error(`GitHub contributions returned HTTP ${upstreamResponse.status}`);
		return jsonResponse({ error: 'Failed to retrieve contribution data' }, 502);
	}

	let payload: unknown;
	try {
		payload = await upstreamResponse.json();
	} catch (error) {
		console.error('Failed to parse GitHub contribution response', error);
		return jsonResponse({ error: 'Invalid contribution data from upstream' }, 502);
	}

	try {
		return jsonResponse(normalizeContributions(username, payload), 200, true);
	} catch (error) {
		if (error instanceof InvalidUpstreamDataError) {
			console.error('GitHub returned an unexpected contribution response', error);
			return jsonResponse({ error: 'Invalid contribution data from upstream' }, 502);
		}

		console.error('Failed to process GitHub contributions', error);
		return jsonResponse({ error: 'Internal server error' }, 500);
	}
};
