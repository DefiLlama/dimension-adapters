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

const chainsMap: Record<string, string> = {
  ARBITRUM: "arbitrum",
};

const fetchVolume: (chain: string) => FetchV2 =
  (chain: string) =>
  async (options: FetchOptions): Promise<FetchResult> => {
    let data = (await queryDune("3289719")) as VolumeRow[];

    const dayStartOfDayTimestamp = getUniqStartOfTodayTimestamp(
      new Date(options.startOfDay * 1000)
    );

    const dayTimestamp = new Date(dayStartOfDayTimestamp * 1000);

    data = data.sort(
      (a, b) =>
        new Date(b.volume_date).getTime() - new Date(a.volume_date).getTime()
    );

    console.log("Timestamps ser", dayTimestamp);

    const dailyVolume =
      data.find(
        row => new Date(row.volume_date).getTime() == dayTimestamp.getTime()
      )?.daily_volume || 0;
    const totalVolume = data.reduce((acc, val) => acc + val.daily_volume, 0);

    return {
      dailyVolume: dailyVolume,
      totalVolume: totalVolume,
      timestamp: dayStartOfDayTimestamp,
    };
  };

const fetchFees: (chain: string) => FetchV2 =
  (chain: string) =>
  async (options: FetchOptions): Promise<FetchResult> => {
    let data = (await queryDune("3289650")) as FeeRow[];

    const dayStartOfDayTimestamp = getUniqStartOfTodayTimestamp(
      new Date(options.startOfDay * 1000)
    );

    const dayTimestamp = new Date(dayStartOfDayTimestamp * 1000);

    data = data.sort(
      (a, b) =>
        new Date(b.transfer_date).getTime() -
        new Date(a.transfer_date).getTime()
    );

    const dailyRevenue =
      data.find(
        row => new Date(row.transfer_date).getTime() == dayTimestamp.getTime()
      )?.usd_total || 0;
    const totalRevenue = data.reduce((acc, val) => acc + val.usd_total, 0);

    console.log("Data ser", data)

    return {
      dailyRevenue,
      totalRevenue,
      timestamp: dayStartOfDayTimestamp,
    };
  };

const fetchAll: (chain: string) => FetchV2 =
  (chain: string) =>
  async (options: FetchOptions): Promise<FetchResultV2> => {
    const volume = await fetchVolume(chain)(options);
    const fees = await fetchFees(chain)(options);
    return { ...volume, ...fees } as FetchResultV2;
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
