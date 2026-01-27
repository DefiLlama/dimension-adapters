import { SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

interface DailyFeeResponse {
  fees: {
    dailyFees: number;
    dailyRevenue: number;
  };
}

const chainOverrides: { [key: string]: string } = {
  terra: "terra2",
  islm: "haqq",
};

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const overriddenChain = chainOverrides[options.chain] || options.chain; // Override if exists, else use original
  const response: DailyFeeResponse = await fetchURL(
    `https://stride-fees-production.up.railway.app/api/${overriddenChain}/stats/fees`
  );

  return {
    dailyFees: response.fees.dailyFees,
    dailyRevenue: response.fees.dailyRevenue,
  };
};

const info = {
  methodology: {
    Fees: "Fees are staking rewards earned by tokens staked with Stride. They are measured across Stride's LSD tokens' yields and converted to USD terms.",
    Revenue: "Stride collects 10% of liquid staked assets's staking rewards. These fees are measured across Stride's LSD tokens' yields and converted to USD terms.",
  },
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.COSMOS, CHAIN.CELESTIA, CHAIN.OSMOSIS, CHAIN.JUNO, CHAIN.TERRA, CHAIN.EVMOS, CHAIN.INJECTIVE, 'umee', 'comdex', CHAIN.HAQQ, 'band', 'dydx', 'stargaze'],
  methodology: info.methodology,
  runAtCurrTime: true,
};

export default adapter;
