import { postURL } from "../../utils/fetchURL";
import {
  BreakdownAdapter,
  FetchOptions,
  FetchResult,
  FetchResultV2,
  FetchV2,
  SimpleAdapter,
} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fetchURLWithRetry } from "../../helpers/duneRequest";
import { queryDune } from "../../helpers/dune";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphFees";

const arbitrumStartTimestamp = 1696982400; // 2023-10-11 00:00:00

type VolumeRow = { volume_date: string; daily_volume: number };
type FeeRow = { transfer_date: string; usd_total: number };
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

    let data = (
      await queryDune("3855069", {
        daytime: date.toISOString(),
      })
    )[0] as StatRow;

    return {
      dailyVolume: data.volume_24hr,
      totalVolume: data.total_volume,
      dailyRevenue: data.fees_24hr,
      totalRevenue: data.total_fees,
      timestamp: dayStartOfDayTimestamp,
    };
  };

const fetchAll: (chain: string) => FetchV2 =
  (chain: string) =>
  async (options: FetchOptions): Promise<FetchResultV2> => {
    const volumeAndFees = await fetchVolumeAndFees(chain)(options);
    return { ...volumeAndFees } as FetchResultV2;
  };
const adapter: BreakdownAdapter = {
  version: 2,
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
