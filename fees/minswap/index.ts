import { Adapter, FetchOptions, FetchResult } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";
import { METRIC } from "../../helpers/metrics";

const URL = 'https://api-mainnet-prod.minswap.org/defillama/v2/fee-series';

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const res = await fetchURL(
    `${URL}?from_timestamp=${options.startTimestamp}&to_timestamp=${options.endTimestamp}`
  );

  const dailyFees = options.createBalances();
  const dailyUserFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  // Number() is required: API returns decimal strings (e.g. "15981.415905").
  // addCGToken passes strings through BigInt() which rejects decimals.
  // Passing a JS number uses the float-safe numeric code path instead.
  dailyFees.addCGToken("cardano", Number(res.dailyFees));
  dailyUserFees.addCGToken("cardano", Number(res.dailyUserFees));
  dailySupplySideRevenue.addCGToken("cardano", Number(res.dailySupplySideRevenue), METRIC.LP_FEES);
  dailyRevenue.addCGToken("cardano", Number(res.dailyRevenue));
  dailyProtocolRevenue.addCGToken("cardano", Number(res.dailyProtocolRevenue), METRIC.SERVICE_FEES);
  dailyHoldersRevenue.addCGToken("cardano", Number(res.dailyHoldersRevenue), METRIC.STAKING_REWARDS);

  return {
    timestamp: res.timestamp,
    dailyFees,
    dailyUserFees,
    dailySupplySideRevenue,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
  };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.CARDANO]: {
      fetch,
      start: "2022-03-25",
    },
  },
  methodology: {
    Fees: "All fees paid by users: AMM trading fee + batcher execution fee.",
    UserFees: "Same as Fees — all fees come from end-users.",
    SupplySideRevenue: "LP fee portion of the AMM trading fee distributed to liquidity providers.",
    Revenue: "Protocol-captured revenue: fee_sharing (to MIN stakers) + batcher fee (to treasury).",
    ProtocolRevenue: "Batcher execution fee collected by the protocol treasury.",
    HoldersRevenue: "Fee-sharing portion of the AMM trading fee distributed to MIN stakers.",
  },
  breakdownMethodology: {
    SupplySideRevenue: {
      [METRIC.LP_FEES]: "LP fee portion of the AMM trading fee distributed to liquidity providers.",
    },
    Revenue: {
      [METRIC.STAKING_REWARDS]: "Fee-sharing portion of the AMM trading fee distributed to MIN stakers.",
      [METRIC.SERVICE_FEES]: "Batcher execution fee collected by the protocol treasury.",
    },
    HoldersRevenue: {
      [METRIC.STAKING_REWARDS]: "Fee-sharing portion of the AMM trading fee distributed to MIN stakers.",
    },
    ProtocolRevenue: {
      [METRIC.SERVICE_FEES]: "Batcher execution fee collected by the protocol treasury.",
    },
  },
};

export default adapter;
