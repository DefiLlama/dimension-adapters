import {
  BreakdownAdapter,
  Fetch,
  FetchOptions,
  FetchResult,
  FetchResultV2,
  FetchV2
} from "../../adapters/types";
import { queryDune } from "../../helpers/dune";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphFees";

const arbitrumStartTimestamp = 1696982400; // 2023-10-11 00:00:00

type StatRow = {
  volume_24hr: number;
  fees_24hr: number;
  total_volume: number;
  total_fees: number;
};

const chainsMap: Record<string, string> = {
  ARBITRUM: "arbitrum",
};

const fetchVolumeAndFees: (chain: string) => FetchV2 =
  (chain: string) =>
  async (options: FetchOptions): Promise<FetchResult> => {
    chain;

    const date = new Date(options.startOfDay * 1000);

    const dayStartOfDayTimestamp = getUniqStartOfTodayTimestamp(date);

    // throw new Error('Dune query is broken, fix it by turning adapter on chain')

    let data = (
      await queryDune("3855069", {
        daytime: date.toISOString(),
      })
    )[0] as StatRow;

    return {
      dailyVolume: data.volume_24hr || 0,
      totalVolume: data.total_volume || 0,
      dailyRevenue: data.fees_24hr || 0,
      totalRevenue: data.total_fees || 0,
      timestamp: dayStartOfDayTimestamp,
    };
  };

const fetchAll: (chain: string) => Fetch =
  (chain: string) =>
  async (_a: any, _t: any ,options: FetchOptions): Promise<FetchResult> => {
    const volumeAndFees = await fetchVolumeAndFees(chain)(options);
    return { ...volumeAndFees } as FetchResult;
  };
const adapter: BreakdownAdapter = {
  isExpensiveAdapter: true,
  breakdown: {
    derivatives: {
      ...Object.values(chainsMap).reduce((acc, chain) => {
        return {
          ...acc,
          [(chainsMap as any)[chain] || chain]: {
            start: arbitrumStartTimestamp,
            fetch: fetchAll(chain),
          },
        };
      }, {}),
    },
  },
};

export default adapter;
