import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getBuilderExports } from "../../helpers/orderly";
import { httpGet } from "../../utils/fetchURL";

const VOLUME_ENDPOINT_MAP = {
  [CHAIN.OFF_CHAIN]:
    "https://fapi.asterdex.com/fapi/v1/statisticsData/adenTradingInfo?period=DAILy",
  [CHAIN.GATE]:
    "https://api.gateperps.com/api/v4/dex_futures/usdt/contract_stats/defillama",
};

const asterBuilderDataMap: Map<string, Promise<any>> = new Map();

/**
 * Fetch data for CHAIN.GATE
 * This endpoint requires a date parameter to request data for a single date
 */
async function fetchGateData(
  endpoint: string,
  dateString: string
): Promise<any> {
  const endpointWithDate = `${endpoint}?date=${dateString}`;
  const cacheKey = `${endpoint}_${dateString}`;

  if (!asterBuilderDataMap.has(cacheKey)) {
    asterBuilderDataMap.set(
      cacheKey,
      httpGet(endpointWithDate).then((res: any) => res)
    );
  }

  const data = await asterBuilderDataMap.get(cacheKey)!;
  if (!data) {
    throw new Error("Data missing for date: " + dateString);
  }

  return {
    dailyVolume: data.volume,
    dailyFees: data.fees,
    dailyRevenue: data.fees,
    dailyProtocolRevenue: data.fees,
    dailyHoldersRevenue: 0,
  };
}

/**
 * Fetch data for CHAIN.OFF_CHAIN
 * This endpoint returns data for multiple dates at once, need to find the specified date from the returned data
 */
async function fetchOffChainData(
  endpoint: string,
  dateString: string
): Promise<any> {
  if (!asterBuilderDataMap.has(endpoint)) {
    asterBuilderDataMap.set(
      endpoint,
      httpGet(endpoint).then((res: any) => {
        const dateDataMap: any = {};
        if (res.perps) {
          res.perps.forEach((item: any) => {
            dateDataMap[item.dateString] = item;
          });
        }
        return dateDataMap;
      })
    );
  }

  const dateDataMap = await asterBuilderDataMap.get(endpoint)!;
  const data = dateDataMap[dateString];

  if (!data) {
    throw new Error("Data missing for date: " + dateString);
  }

  return {
    dailyVolume: +data.takerVolume + +data.makerVolume,
    dailyFees: +data.builderFee,
    dailyRevenue: +data.builderFee,
    dailyProtocolRevenue: +data.builderFee,
    dailyHoldersRevenue: 0,
  };
}

/**
 * Unified data fetching entry point, routes to the appropriate handler function based on type
 */
async function commonFetch(
  type: keyof typeof VOLUME_ENDPOINT_MAP,
  _: any,
  _1: any,
  { dateString }: FetchOptions
) {
  const endpoint = VOLUME_ENDPOINT_MAP[type];

  if (type === CHAIN.GATE) {
    return fetchGateData(endpoint, dateString);
  }

  if (type === CHAIN.OFF_CHAIN) {
    return fetchOffChainData(endpoint, dateString);
  }

  throw new Error(`Unsupported chain type: ${type}`);
}

const methodology = {
  Fees: "Builder Fees collected from Orderly Network(0.4 bps on taker volume) and Aster Exchange(0.4 bps on taker volume)",
  Revenue: "All the fees collected",
  ProtocolRevenue: "All the revenue go to the protocol",
};

const adapter = getBuilderExports({
  broker_id: "aden",
  start: "2025-07-14",
  methodology,
}) as SimpleAdapter;

adapter.adapter = {
  [CHAIN.ORDERLY]: {
    start: "2025-07-14",
    fetch: async function (_: any, _1: any, options: FetchOptions) {
      return {
        ...(await (adapter.fetch as any)(_, _1, options)),
        dailyHoldersRevenue: 0,
      };
    },
  },
  [CHAIN.OFF_CHAIN]: {
    start: "2025-07-19",
    fetch: (_: any, _1: any, options: FetchOptions) =>
      commonFetch(CHAIN.OFF_CHAIN, _, _1, options),
  },
  [CHAIN.GATE]: {
    start: "2025-11-01",
    fetch: (_: any, _1: any, options: FetchOptions) =>
      commonFetch(CHAIN.GATE, _, _1, options),
  },
};

export default adapter;
