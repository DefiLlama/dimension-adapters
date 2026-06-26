import fetchURL from "../utils/fetchURL";
import { FetchOptions, FetchResult, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

const poolsURL = "https://bff.bitflowapis.finance/api/app/v1/pools";

interface Pool {
  feesUsd1d: number;
  xProtocolFee: number;
  xProviderFee: number;
}

const fetch = async ({ createBalances }: FetchOptions): Promise<FetchResult> => {
  const { data: pools }: { data: Pool[] } = await fetchURL(poolsURL);

  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();

  for (const pool of pools) {
    const fees = Number(pool.feesUsd1d);
    const protocolFeeShare = Number(pool.xProtocolFee) / (Number(pool.xProtocolFee) + Number(pool.xProviderFee));

    dailyFees.addUSDValue(fees, METRIC.SWAP_FEES );
    dailyRevenue.addUSDValue(fees * protocolFeeShare, "Swap fees to protocol");
    dailySupplySideRevenue.addUSDValue(fees * (1 - protocolFeeShare), "Swap fees to LPs");
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Trading fees collected from all Bitflow pools.",
  UserFees: "Trading fees paid by traders on swaps.",
  Revenue: "Trading fees collected by protocol.",
  ProtocolRevenue: "Trading fees collected by protocol.",
  SupplySideRevenue: "Trading fees distributed to LPs.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Swap fees collected from all Bitflow pools.",
  },
  UserFees: {
    [METRIC.SWAP_FEES]: "Swap fees paid by traders on swaps.",
  },
  Revenue: {
    "Swap fees to protocol": "Swap fees collected by protocol.",
  },
  ProtocolRevenue: {
    "Swap fees to protocol": "Swap fees collected by protocol.",
  },
  SupplySideRevenue: {
    "Swap fees to LPs": "Swap fees distributed to LPs.",
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
