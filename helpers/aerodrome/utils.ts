export const MAX_BLOCK_RANGE = 2000;
export const MAX_CONCURRENCY = 5;

export const splitRange = (from: number, to: number, maxRange: number = MAX_BLOCK_RANGE) => {
	const ranges = [];

	for (let start = from; start <= to; start += maxRange) {
		const end = Math.min(start + maxRange - 1, to);
		ranges.push([start, end]);
	}

	return ranges;
};
