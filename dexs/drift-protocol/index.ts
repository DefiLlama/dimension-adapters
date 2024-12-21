import { CHAIN } from "../../helpers/chains";
import { queryDune } from "../../helpers/dune";
import { BreakdownAdapter, FetchOptions } from "../../adapters/types";

// const DUNE_QUERY_ID = "3756979"; // https://dune.com/queries/3756979/6318568
const DUNE_QUERY_ID = "4057938"; // Should be faster than the above - https://dune.com/queries/3782153/6359334

type DimentionResult = {
  dailyVolume?: number;
  dailyFees?: number;
  dailyUserFees?: number;
  dailyRevenue?: number;
};

let duneFetch;

async function getPerpDimensions(
  options: FetchOptions,
): Promise<DimentionResult> {
  if (!duneFetch) duneFetch = await queryDune("3782153");
  const res = await duneFetch;
  const [{ perpetual_volume, total_revenue, total_taker_fee }] = res;
  return {
    dailyVolume: perpetual_volume,
    dailyFees: total_taker_fee,
    dailyRevenue: total_revenue,
  };
}

async function getSpotDimensions(
  options: FetchOptions,
): Promise<DimentionResult> {
  if (!duneFetch) duneFetch = await queryDune("3782153");
  const res = await duneFetch;
  const [{ perpetual_volume, total_volume }] = res;
  const dailyVolume = total_volume - perpetual_volume;
  return { dailyVolume };
}

async function fetch(type: "perp" | "spot", options: FetchOptions) {
  const timestamp = Date.now() / 1e3;
  if (type === "perp") {
    const results = await getPerpDimensions(options);
    return {
      ...results,
      timestamp,
    };
  } else {
    const results = await getSpotDimensions(options);
    return {
      ...results,
      timestamp: Date.now() / 1e3,
    };
  }
}

const adapter: BreakdownAdapter = {
  breakdown: {
    swap: {
      [CHAIN.SOLANA]: {
        fetch: (_t: any, _tt: any, options: FetchOptions) =>
          fetch("spot", options),
        start: "2023-07-25",
      },
    },
    derivatives: {
      [CHAIN.SOLANA]: {
        fetch: (_t: any, _tt: any, options: FetchOptions) =>
          fetch("perp", options),
        start: "2023-07-25",
      },
    },
  },
  isExpensiveAdapter: true,
};

export default adapter;
