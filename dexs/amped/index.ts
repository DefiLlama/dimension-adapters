import request, { gql } from "graphql-request";
import { Fetch, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const endpoints: { [key: string]: string } = {
  [CHAIN.LIGHTLINK_PHOENIX]:
	"https://graph.phoenix.lightlink.io/query/subgraphs/name/amped-finance/trades",
  [CHAIN.SONIC]:
	"https://api.goldsky.com/api/public/project_cm9j641qy0e0w01tzh6s6c8ek/subgraphs/sonic-trades/1.0.6/gn",
  // [CHAIN.BSC]: "https://api.studio.thegraph.com/query/91379/amped-trades-bsc/version/latest",
  [CHAIN.BERACHAIN]: "https://api.studio.thegraph.com/query/91379/amped-trades-bera/version/latest",
  [CHAIN.BASE]: "https://api.studio.thegraph.com/query/91379/trades-base/version/latest",
  [CHAIN.SSEED]: "https://api.goldsky.com/api/public/project_cm9j641qy0e0w01tzh6s6c8ek/subgraphs/superseed-trades/1.0.1/gn",
};

const historicalDataSwap = gql`
  query get_swap_volume($period: String!, $id: String!) {
	volumeStats(where: { period: $period, id: $id }) {
	  swap
	}
  }
`;

const historicalDataDerivatives = gql`
  query get_derivatives_volume($period: String!, $id: String!) {
	volumeStats(where: { period: $period, id: $id }) {
	  liquidation
	  margin
	}
  }
`;

interface IVolumeStatsResponse {
  volumeStats: Array<{
	swap?: string;
	liquidation?: string;
	margin?: string;
  }>;
}

const createCombinedFetch = (chain: string): Fetch => {
  return async (timestamp: number) => {
	const dayTimestamp = getUniqStartOfTodayTimestamp(
	  new Date(timestamp * 1000)
	);

	let dailySwapVolume = 0;
	try {
	  const swapDailyData: IVolumeStatsResponse = await request(endpoints[chain], historicalDataSwap, {
		id: String(dayTimestamp) + ":daily",
		period: "daily",
	  });
	  if (swapDailyData.volumeStats.length > 0 && swapDailyData.volumeStats[0]?.swap) {
		dailySwapVolume = Number(swapDailyData.volumeStats[0].swap);
	  }
	} catch (error) {
	  console.error(`Failed to fetch swap data for chain ${chain} on ${new Date(timestamp * 1000).toISOString()}:`, error);
	}

	let dailyDerivativesVolume = 0;
	try {
	  const derivativesDailyData: IVolumeStatsResponse = await request(endpoints[chain], historicalDataDerivatives, {
		id: String(dayTimestamp) + ":daily",
		period: "daily",
	  });
	  if (derivativesDailyData.volumeStats.length > 0) {
		dailyDerivativesVolume =
		  Number(derivativesDailyData.volumeStats[0]?.margin || 0) +
		  Number(derivativesDailyData.volumeStats[0]?.liquidation || 0);
	  }
	} catch (error) {
	  console.error(`Failed to fetch derivatives data for chain ${chain} on ${new Date(timestamp * 1000).toISOString()}:`, error);
	}

	const combinedDailyVolumeRaw = dailySwapVolume + dailyDerivativesVolume;

	if (combinedDailyVolumeRaw === 0) {
	  return {
		timestamp: dayTimestamp,
	  };
	}

	const combinedDailyVolumeScaled = combinedDailyVolumeRaw * 10 ** -30;

	return {
	  timestamp: dayTimestamp,
	  dailyVolume: String(combinedDailyVolumeScaled),
	};
  };
};

const startTimestamps: { [chain: string]: number } = {
  [CHAIN.LIGHTLINK_PHOENIX]: 1717199544,

  [CHAIN.SONIC]: 1735685544,   
  // [CHAIN.BSC]: 1727740344, 
  [CHAIN.BERACHAIN]: 1738882079,
  [CHAIN.BASE]: 1740056400,
  [CHAIN.SSEED]: 1745330400,

};

const methodology = {
  dailyVolume: "Combined daily trading volume from spot swaps, margin trading, and liquidations, reported in USD. Fetched from the Amped Finance subgraph for the specified day.",
  Fees: "Trading fees vary based on liquidity and market conditions.",
  UserFees: "Users pay variable trading fees.",
  Revenue: "No revenue is taken by the protocol.",
  HoldersRevenue: "No revenue is distributed to token holders.",
  ProtocolRevenue: "Protocol does not take any revenue.",
  SupplySideRevenue: "70% of trading fees are distributed to liquidity providers.",
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: Object.keys(endpoints).reduce((acc, chainKey) => {
	acc[chainKey] = {
	  fetch: createCombinedFetch(chainKey),
	  start: startTimestamps[chainKey],
	  meta: {
		methodology: methodology,
	  },
	};
	return acc;
  }, {} as SimpleAdapter['adapter']),
};

export default adapter;
