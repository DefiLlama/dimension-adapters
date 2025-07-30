import fetchURL from "../utils/fetchURL";
import { FetchOptions, FetchResult, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../helpers/getUniSubgraphVolume";

const historicalVolumeBerachainEndpoint = (from: string, to: string) =>
	`https://api-trading-bera.holdstation.com/api/fees/summary/internal?fromDate=${from}&toDate=${to}`;
const dailyVolumeBerachainEndpoint = (from: string, to: string) =>
	`https://api-trading-bera.holdstation.com/api/trading-history/volume-by-day?fromDate=${from}&toDate=${to}`;

const dailyVolumeWorldchainEndpoint = (from: string, to: string) =>
	`https://worldfuture.holdstation.com/api/trading-history/volume-by-day?fromDate=${from}&toDate=${to}`;

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

const endpointMap: {
	[chain: string]: { historical?: URLBuilder; daily: URLBuilder };
} = {
	[CHAIN.BERACHAIN]: {
		historical: historicalVolumeBerachainEndpoint,
		daily: dailyVolumeBerachainEndpoint,
	},
	[CHAIN.WC]: {
		daily: dailyVolumeWorldchainEndpoint,
	},
};

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
	const { historical, daily } = endpointMap[options.chain];

	const dayTimestamp = getUniqStartOfTodayTimestamp(
		new Date(options.startTimestamp * 1000)
	);
	const fromTimestamp = new Date(dayTimestamp * 1000)
		.toISOString()
		.split("T")[0];
	const toTimestamp = new Date((dayTimestamp + 60 * 60 * 24) * 1000)
		.toISOString()
		.split("T")[0];

	let data: IFees;
	if (historical) {
		data = (await fetchURL(historical(fromTimestamp, toTimestamp))).result;
	} else {
		data = {
			totalFee: "",
			govFee: "",
			vaultFee: "",
		};
	}
	const dailyVolume: DailyVolume[] = await fetchURL(
		daily(fromTimestamp, fromTimestamp)
	);

	const dailyFees = data.totalFee;
	const dailyRevenue = data.govFee;
	const dailySupplySideRevenue = data.vaultFee;

	return {
		dailyVolume: dailyVolume.length > 0 ? dailyVolume[0].volume : "0",
		dailyFees,
		dailyRevenue,
		dailySupplySideRevenue,
	};
};

const adapter: SimpleAdapter = {
	version: 1,
	adapter: {
		[CHAIN.BERACHAIN]: {
			fetch,
			start: "2025-02-07",
		},
		[CHAIN.WC]: {
			fetch,
			runAtCurrTime: true,
			start: "2024-06-04",
		},
	},
};

export default adapter;
