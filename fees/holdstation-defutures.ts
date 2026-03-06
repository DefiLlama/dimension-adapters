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

const dailyVolumeBSCEndpoint = (from: string, to: string) =>
	`https://bnbfutures.holdstation.com/api/trading-history/volume-by-day?fromDate=${from}&toDate=${to}`;
const historicalVolumeBSCEndpoint = (from: string, to: string) =>
	`https://bnbfutures.holdstation.com/api/fees/summary/internal?fromDate=${from}&toDate=${to}`;
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
	[CHAIN.BSC]: {
		historical: historicalVolumeBSCEndpoint,
		daily: dailyVolumeBSCEndpoint,
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

const methodology = {
	Fees: "All trading fees collected from perpetual futures trades on the platform",
	Revenue: "Governance fees retained by the protocol from trading activity",
	SupplySideRevenue: "Vault fees distributed to liquidity providers who supply capital to trading vaults"
};

const breakdownMethodology = {
	Fees: {
		"Trading Fees": "All fees charged on perpetual futures trading including opening, closing, and modifying positions"
	},
	Revenue: {
		"Governance Fees": "Portion of trading fees allocated to protocol governance and treasury"
	},
	SupplySideRevenue: {
		"Vault Fees": "Portion of trading fees distributed to vault liquidity providers who supply capital for trading"
	}
};

const adapter: SimpleAdapter = {
	version: 1,
	adapter: {
		// [CHAIN.BERACHAIN]: {
		// 	fetch,
		// 	start: "2025-02-07",
		// },
		[CHAIN.WC]: {
			fetch,
			start: "2025-06-04",
		},
		[CHAIN.BSC]: {
			fetch,
			start: "2025-09-03",
		},
	},
	methodology,
	breakdownMethodology,
};

export default adapter;