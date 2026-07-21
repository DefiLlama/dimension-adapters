import {
  FetchOptions,
  FetchResponseValue,
  FetchResult,
  FetchV2,
  SimpleAdapter,
} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import swaphoodV2Adapter, { START as V2_START } from "./swaphood";
import swaphoodV2 from "./swaphood";
import swaphoodV3 from "./swaphood-v3";

const METRIC = {
  SWAP_FEES: "Token Swap Fees",
  PROTOCOL_REVENUE: "Swap Fees Retained By Protocol",
  V2_HOLDERS_REVENUE: "Swap Fees Distributed To Holders",
  V3_HOLDERS_REVENUE: "Swap Fees Used For HOOD Buybacks",
  HOOD_BUYBACKS: "HOOD Buybacks",
  LP_REVENUE: "Swap Fees To Liquidity Providers",
};

function requireFetch(
  adapter: SimpleAdapter,
  version: string,
): FetchV2 {
  if (!adapter.fetch) {
    throw new Error(`Missing SwapHood ${version} fetch function`);
  }

  return adapter.fetch;
}

const fetchV2 = requireFetch(swaphoodV2, "V2");
const fetchV3 = requireFetch(swaphoodV3, "V3");

function addResponseValue(
  balances: ReturnType<FetchOptions["createBalances"]>,
  value: FetchResponseValue | undefined,
): void {
  if (value === undefined) return;

  if (typeof value === "string" || typeof value === "number") {
    balances.addUSDValue(value);
    return;
  }

  balances.addBalances(value);
}

const fetch = async (
  options: FetchOptions,
): Promise<FetchResult> => {
  const [v2Stats, v3Stats] = await Promise.all([
    fetchV2(options),
    fetchV3(options),
  ]);

  const dailyFees = options.createBalances();
  const dailyUserFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  for (const stats of [v2Stats, v3Stats]) {
    addResponseValue(dailyFees, stats.dailyFees);
    addResponseValue(dailyUserFees, stats.dailyUserFees);
    addResponseValue(dailyRevenue, stats.dailyRevenue);
    addResponseValue(
      dailyProtocolRevenue,
      stats.dailyProtocolRevenue,
    );
    addResponseValue(
      dailyHoldersRevenue,
      stats.dailyHoldersRevenue,
    );
    addResponseValue(
      dailySupplySideRevenue,
      stats.dailySupplySideRevenue,
    );
  }

  return {
    dailyFees,
    dailyUserFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees:
    "All swap fees paid by users across SwapHood V2 pairs and V3 pools.",
  UserFees:
    "All swap fees paid directly by SwapHood V2 and V3 users.",
  Revenue:
    "For staked V2 pairs, 95% of fees goes to holders and 5% to the protocol. Non-staked V2 fees go to LPs. SwapHood V3 allocates 95% of fees to HOOD buybacks and retains 5% as protocol revenue.",
  ProtocolRevenue:
    "5% of fees from staked V2 pairs and 5% of V3 fees is retained by the protocol.",
  HoldersRevenue:
    "95% of fees from staked V2 pairs is distributed to holders, while 95% of V3 fees funds HOOD buybacks.",
  SupplySideRevenue:
    "Non-staked V2 pair fees go entirely to liquidity providers. V3 liquidity providers receive no swap-fee revenue.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]:
      "All swap fees paid by SwapHood V2 and V3 users.",
  },
  UserFees: {
    [METRIC.SWAP_FEES]:
      "All swap fees paid directly by SwapHood V2 and V3 users.",
  },
  Revenue: {
    [METRIC.PROTOCOL_REVENUE]:
      "The protocol share of staked V2 pair fees and V3 fees.",
    [METRIC.V2_HOLDERS_REVENUE]:
      "The holders share of fees from staked V2 pairs.",
    [METRIC.V3_HOLDERS_REVENUE]:
      "The share of V3 fees allocated to HOOD buybacks.",
  },
  ProtocolRevenue: {
    [METRIC.PROTOCOL_REVENUE]:
      "5% of fees from staked V2 pairs and 5% of V3 fees.",
  },
  HoldersRevenue: {
    [METRIC.V2_HOLDERS_REVENUE]:
      "95% of fees from staked V2 pairs distributed to holders.",
    [METRIC.HOOD_BUYBACKS]:
      "95% of V3 fees allocated to HOOD buybacks.",
  },
  SupplySideRevenue: {
    [METRIC.LP_REVENUE]:
      "100% of fees from non-staked V2 pairs distributed to liquidity providers.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: V2_START,
  methodology,
  breakdownMethodology,
};

export default adapter;
