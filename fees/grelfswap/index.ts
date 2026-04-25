import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { httpGet } from "../../utils/fetchURL";

const fetchFees = async (_t: any, _b: any, options: FetchOptions) => {
  const dailyFees = options.createBalances()
  const data = await httpGet(
    `https://grelfswap.com/api/defillama/fees?startTimestamp=${options.startTimestamp}`
  );
  if (!data || data.dailyFeesUsd === undefined) {
    throw new Error(`No data found for ${options.startTimestamp}`);
  }
  dailyFees.addUSDValue(data.dailyFeesUsd, METRIC.SWAP_FEES)
  return {
    dailyFees,
    dailyRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  chains: [CHAIN.HEDERA],
  fetch: fetchFees,
  start: '2025-11-07',
  methodology: {
    Fees: "Platform fees collected on each swap (USD value of the fee taken from the input token).",
    Revenue: "All platform fees go to the protocol treasury.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.SWAP_FEES]: "Platform fee on the input token of each swap, computed as (feeAmount / fromAmount) × valueUsd at execution time.",
    },
    Revenue: {
      [METRIC.SWAP_FEES]: "Entire platform swap fee is retained by the protocol treasury (no token-holder distribution).",
    },
  },
};

export default adapter;
