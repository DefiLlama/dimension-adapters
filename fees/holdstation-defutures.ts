import fetchURL from "../utils/fetchURL";
import { FetchOptions, FetchResult, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../helpers/getUniSubgraphVolume";

const historicalVolumeEndpoint = (from: string, to: string) =>
	`https://api-trading.holdstation.com/api/fees/summary?fromDate=${from}&toDate=${to}`;
const dailyVolumeEndpoint = (from: string, to: string) =>
	`https://api-trading.holdstation.com/api/trading-history/volume-by-day?fromDate=${from}&toDate=${to}`;

const historicalVolumeBerachainEndpoint = (from: string, to: string) =>
	`https://api-trading-bera.holdstation.com/api/fees/summary/internal?fromDate=${from}&toDate=${to}`;
const dailyVolumeBerachainEndpoint = (from: string, to: string) =>
	`https://api-trading-bera.holdstation.com/api/trading-history/volume-by-day?fromDate=${from}&toDate=${to}`;

interface IFees {
	totalFee: string;
	govFee: string;
	vaultFee: string;
}

interface DailyVolume {
	date: string;
	volume: string;
	totalVolume: string;
}

type URLBuilder = (from: string, to: string) => string;

const endpointMap: { [chain: string]: { historical: URLBuilder, daily: URLBuilder } } = {
	[CHAIN.ERA]: {
		historical: historicalVolumeEndpoint,
		daily: dailyVolumeEndpoint,
	},
	[CHAIN.BERACHAIN]: {
		historical: historicalVolumeBerachainEndpoint,
		daily: dailyVolumeBerachainEndpoint,
	}
};

const fetch = async (timestamp: number, _t: any, options: FetchOptions): Promise<FetchResult> => {

	const { historical, daily } = endpointMap[options.chain];

	const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
	const fromTimestamp = new Date(dayTimestamp * 1000).toISOString().split("T")[0];
	const toTimestamp = new Date((dayTimestamp + 60 * 60 * 24) * 1000).toISOString().split("T")[0];
	const data: IFees = (await fetchURL(historical(fromTimestamp, toTimestamp))).result;
	const dailyVolume: DailyVolume[] = (await fetchURL(daily(fromTimestamp, fromTimestamp)));

	const dailyFees = data.totalFee;
	const dailyRevenue = data.govFee;
	const dailySupplySideRevenue = data.vaultFee;

	return {
		dailyFees,
		dailyRevenue,
		dailyVolume: dailyVolume.length > 0 ? dailyVolume[0].volume : "0",
		dailySupplySideRevenue: dailySupplySideRevenue,
		timestamp: dayTimestamp,
	};
}

const adapter: SimpleAdapter = {
	version: 1,
	adapter: {
		// [CHAIN.ERA]: {
		// 	fetch,
		// 	start: '2023-05-09',
		// },
		[CHAIN.BERACHAIN]: {
			fetch,
			start: '2025-02-07',
		},
	},
};

export default adapter;
