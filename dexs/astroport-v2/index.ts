import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";
import { METRIC } from "../../helpers/metrics";

const chainIdMap: Record<string, string> = {
  "terra2": "phoenix-1",
  "neutron": "neutron-1",
};

let res: any;
const url = "https://app.astroport.fi/api/trpc/protocol.stats?input=%7B%22json%22%3A%7B%22chains%22%3A%5B%22phoenix-1%22%2C%22neutron-1%22%5D%7D%7D";

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  if (!res) res = fetchURL(url);
  const chainId = chainIdMap[options.chain];
  const results = (await res).result.data.json.chains[chainId];

  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  dailyFees.addCGToken("usd-coin", results.dayLpFeesUSD, METRIC.SWAP_FEES);
  dailySupplySideRevenue.addCGToken("usd-coin", results.dayLpFeesUSD, METRIC.LP_FEES);

  return {
    dailyVolume: results.dayVolumeUSD,
    dailyFees,
    dailyRevenue: 0,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Trading fees paid by users on each swap",
  Revenue: "Protocol doesn't keep any fees",
  SupplySideRevenue: "All swap fees are distributed to liquidity providers",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Fees collected on all swaps across Astroport's liquidity pools",
  },
  SupplySideRevenue: {
    [METRIC.LP_FEES]: "100% of swap fees distributed to liquidity providers",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  runAtCurrTime: true,
  fetch,
  adapter: {
    terra2: {
      start: '2022-12-16',
    },
    // deprecated: https://github.com/DefiLlama/dimension-adapters/issues/5116#issuecomment-3660619459
    // [CHAIN.INJECTIVE]: {
    //   start: '2023-XX-XX',
    // },
    neutron: {
      start: '2023-08-01',
    },
    // [CHAIN.SEI]: {
    //   start: '2023-XX-XX',
    // },
    // [CHAIN.OSMOSIS]: {
    //   start: '2023-XX-XX',
    // },
  },
  methodology,
  breakdownMethodology,
};

export default adapter;
