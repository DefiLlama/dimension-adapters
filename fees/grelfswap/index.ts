import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { httpGet } from "../../utils/fetchURL";

const fetchFees = async (options: FetchOptions) => {
  const data = await httpGet(
    "https://grelfswap.com/api/defillama/fees-interval?startTimestamp=" +
      options.startTimestamp +
      "&endTimestamp=" +
      options.endTimestamp,
  );

  if (!data || !Number.isFinite(data.feesUsd) || data.feesUsd < 0) {
    throw new Error(
      "No valid GrelfSwap fees for " + options.startTimestamp + "-" + options.endTimestamp,
    );
  }

  const dailyFees = options.createBalances();
  dailyFees.addUSDValue(data.feesUsd, METRIC.SWAP_FEES);

  return {
    dailyFees,
    dailyRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.HEDERA]: {
      fetch: fetchFees,
      start: "2025-11-07",
    },
  },
  methodology: {
    Fees: "Platform fees collected on each swap (USD value of the fee taken from the input token).",
    Revenue: "All platform fees go to the protocol treasury.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.SWAP_FEES]:
        "Platform fee on the input token of each swap, computed as (feeAmount / fromAmount) × valueUsd at execution time.",
    },
    Revenue: {
      [METRIC.SWAP_FEES]:
        "Entire platform swap fee is retained by the protocol treasury (no token-holder distribution).",
    },
  },
};

export default adapter;
