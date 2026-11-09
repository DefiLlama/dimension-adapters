import { CHAIN } from "../../helpers/chains";
import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";
import { FetchResultVolume } from "../../adapters/types";

interface IVolumeData {
	success: boolean;
	history: {
		date: string;
		volume: number;
	}[];
}

interface IOpenInterestData {
	success: boolean;
	history: {
		date: string;
		openInterestSnapshot: {
			longTotal: number;
			shortTotal: number;
			totalRatio: number;
		};
	}[];
}

const API_URL = "https://api.avantisfi.com/v1";
// The API sums fill events emitted by TradingCallbacks 0x0C16ff40065Cc3Ab4bc55B60E447504AFB9C7970 (MarketExecuted,
// LimitExecuted, Open/CloseTwapSliceFilled, Open/CloseRfqSliceFilled, PositionIncreaseRegistered + PositionSizeIncreased)
// and reads open interest from Multicall 0xb7125506Ff25211c4C51DFD8DdED00BE6Fa8Cbf7 getLongShortRatios() at the day-end block

// first day with a stored day-end open interest snapshot
const OPEN_INTEREST_START = '2024-02-05';
// the day-end snapshot is stored after the day closes; until then the API returns a zero row for that day
const OPEN_INTEREST_PUBLISH_DELAY_DAYS = 3;

const fetch = async (options: FetchOptions): Promise<FetchResultVolume> => {
	const dateStr = options.dateString;
	const ageDays = (Date.now() / 1000 - options.startOfDay) / 86400;
	// the API returns every day from `daysAgo` days back until today, so ask for enough days to cover the requested one
	// (the /cached/ endpoints only keep the last 365 days, which made older days impossible to refill)
	const daysAgo = Math.ceil(ageDays) + 1;

	const volumeData: IVolumeData = await fetchURL(`${API_URL}/history/analytics/daily-volumes/${daysAgo}`);
	if (!volumeData.success) throw new Error("avantis: failed to fetch volume");
	const dailyVolume = volumeData.history.find((d) => d.date === dateStr)?.volume;
	if (dailyVolume === undefined) throw new Error(`avantis: no volume row for ${dateStr}`);

	if (dateStr < OPEN_INTEREST_START) return { dailyVolume };

	const openInterestData: IOpenInterestData = await fetchURL(`${API_URL}/history/analytics/open-interest-snapshot/${daysAgo}`);
	if (!openInterestData.success) throw new Error("avantis: failed to fetch open interest");
	const openInterest = openInterestData.history.find((d) => d.date === dateStr)?.openInterestSnapshot;

	// the API fills a day without a stored snapshot with zeros; the book has had open positions every day since launch,
	// so a zero is a missing snapshot, never a real reading
	if (!openInterest?.totalRatio) {
		// a recent day's snapshot may not be stored yet: throw so the run is retried instead of storing 0
		if (ageDays < OPEN_INTEREST_PUBLISH_DELAY_DAYS) throw new Error(`avantis: no open interest snapshot yet for ${dateStr}`);
		// 18 older days never got a snapshot (e.g. 2024-05-31, 2025-11-15): publish the volume and leave open interest out
		return { dailyVolume };
	}

	return {
		dailyVolume,
		// totalRatio is the sum of long + short = Avantis' own totalOi. Pool venue: every position faces the
		// pool, so the sum counts each open position once (on-chain openTrades sum to these exactly).
		openInterestAtEnd: openInterest.totalRatio,
		longOpenInterestAtEnd: openInterest.longTotal,
		shortOpenInterestAtEnd: openInterest.shortTotal,
	};
};

const methodology = {
	Volume: "Notional size (collateral x leverage) of every trade: opens, closes, partial closes, take-profits, stop-losses, liquidations, TWAP slices and position increases.",
	OpenInterest: "Notional size of all open long and short positions at the end of the day, read from the protocol's contracts on Base.",
};

const adapter: SimpleAdapter = {
	version: 1,
	adapter: {
		[CHAIN.BASE]: {
			fetch,
			start: '2024-01-27',
		},
	},
	methodology,
};

export default adapter;
