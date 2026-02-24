import type { SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../helpers/getUniSubgraphVolume";
import fetchURL from "../utils/fetchURL";

const apiEVM = "https://api.orderly.org/md/volume/daily_stats";

type VolumeBreakdown = {
  chainId: string;
  volume: number;
};

type DailyStats = {
  volume: number;
  date: string;
  netFee: number;
  dateString: string;
  createdAt: string;
  volumeBreakdown?: VolumeBreakdown[];
};

const chainIdToChainInfo: {
  [key: string]: { chain: CHAIN; startDate: string };
} = {
  "42161": { chain: CHAIN.ARBITRUM, startDate: "2023-10-26" },
  "10": { chain: CHAIN.OPTIMISM, startDate: "2023-11-30" },
  "137": { chain: CHAIN.POLYGON, startDate: "2024-02-05" },
  "8453": { chain: CHAIN.BASE, startDate: "2024-04-03" },
  "5000": { chain: CHAIN.MANTLE, startDate: "2024-05-28" },
  "1": { chain: CHAIN.ETHEREUM, startDate: "2024-06-13" },
  "1329": { chain: CHAIN.SEI, startDate: "2024-10-18" },
  "43114": { chain: CHAIN.AVAX, startDate: "2024-11-07" },
  "900900900": { chain: CHAIN.SOLANA, startDate: "2024-11-29" },
  "2818": { chain: CHAIN.MORPH, startDate: "2024-12-17" },
  "146": { chain: CHAIN.SONIC, startDate: "2024-12-31" },
  "80094": { chain: CHAIN.BERACHAIN, startDate: "2025-03-07" },
  "1514": { chain: CHAIN.STORY, startDate: "2025-03-07" },
  "34443": { chain: CHAIN.MODE, startDate: "2025-03-19" },
  "98866": { chain: CHAIN.PLUME, startDate: "2025-05-14" },
  "2741": { chain: CHAIN.ABSTRACT, startDate: "2025-05-29" },
  "56": { chain: CHAIN.BSC, startDate: "2025-06-27" },
  "143": { chain: CHAIN.MONAD, startDate: "2025-11-24" },
};

const fetchVolume = async (chainId: string, startOfDay: number) => {
  const data: DailyStats[] = await fetchURL(apiEVM);
  const cleanTimestamp = getUniqStartOfTodayTimestamp(
    new Date(startOfDay * 1000)
  );

  // Find the stats for the requested date
  const targetDate = new Date(startOfDay * 1000).toISOString().split("T")[0];
  const dailyStats = data.find((day) => day.date.startsWith(targetDate));

  if (!dailyStats)
    return {
      timestamp: cleanTimestamp,
      dailyVolume: "0",
    };

  const volume = dailyStats.volumeBreakdown?.find(
    (b) => b.chainId === chainId
  )?.volume;

  return {
    timestamp: cleanTimestamp,
    dailyVolume: volume?.toString() || "0",
  };
};

const adapter: SimpleAdapter = {
  adapter: Object.entries(chainIdToChainInfo).reduce(
    (acc, [chainId, { chain, startDate }]) => ({
      ...acc,
      [chain]: {
        start: startDate,
        fetch: async (__t: number, _: any, { startOfDay }: FetchOptions) =>
          fetchVolume(chainId, startOfDay),
      },
    }),
    {}
  ),
};

export default adapter;
