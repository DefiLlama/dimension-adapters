import fetchURL from "../utils/fetchURL";
import { FetchOptions, FetchResult, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

const poolsURL = "https://bff.bitflowapis.finance/api/app/v1/pools";

interface Pool {
  feesUsd1d: number;
}

const fetch = async ({ createBalances }: FetchOptions): Promise<FetchResult> => {
  const { data: pools }: { data: Pool[] } = await fetchURL(poolsURL);

  let dailyFeesUsd = 0;

  for (const pool of pools) {
    const fees = Number(pool.feesUsd1d);
    if (!Number.isFinite(fees) || fees <= 0) continue;
    dailyFeesUsd += fees;
  }

  const dailyFees = createBalances();
  dailyFees.addUSDValue(dailyFeesUsd, METRIC.SWAP_FEES);

  const dailyUserFees = dailyFees.clone();

  return {
    dailyFees,
    dailyUserFees,
  };
};

const methodology = {
  Fees: "Trading fees collected from all Bitflow pools.",
  UserFees: "Trading fees paid by traders on swaps.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Swap fees collected from all Bitflow pools.",
  },
  UserFees: {
    [METRIC.SWAP_FEES]: "Swap fees paid by traders on swaps.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  chains: [CHAIN.STACKS],
  fetch,
  runAtCurrTime: true,
  methodology,
  breakdownMethodology,
};

export default adapter;
