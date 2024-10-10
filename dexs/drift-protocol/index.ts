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

type IRequest = {
  [key: string]: Promise<any>;
}
const requests: IRequest = {}

export async function fetchURLWithRetry(url: string, options: FetchOptions) {
  const start = options.startOfDay;
  const key = `${url}-${start}`;
  if (!requests[key])
    requests[key] = queryDune("4117889", {
      start: start,
      end: start + 24 * 60 * 60,
    })
  return requests[key]
}

async function getPerpDimensions(options: FetchOptions): Promise<DimentionResult> {
  const volumeResponse = await fetchURLWithRetry("4117889", options)
  const dailyVolume = volumeResponse[0].perpetual_volume;
  const dailyFees = volumeResponse[0].total_taker_fee;
  const dailyRevenue = volumeResponse[0].total_revenue;
  return { dailyVolume, dailyFees, dailyRevenue };
}

async function getSpotDimensions(options: FetchOptions): Promise<DimentionResult> {
  const volumeResponse = await fetchURLWithRetry("4117889", options)
  const dailyVolume = volumeResponse[0].spot_volume;
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
        fetch: (_t: any, _tt: any, options: FetchOptions) => fetch("spot", options),
        start: 1690239600,
      },
    },
    derivatives: {
      [CHAIN.SOLANA]: {
        fetch: (_t: any, _tt: any, options: FetchOptions) => fetch("perp", options),
        start: 1690239600,
      },
    },
  },
  isExpensiveAdapter: true,
};

export default adapter;
