import type { SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
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

// const chainIdToChainInfo: {
//   [key: string]: { chain: CHAIN; startDate: string };
// } = {
//   "42161": { chain: CHAIN.ARBITRUM, startDate: "2023-10-26" },
//   "10": { chain: CHAIN.OPTIMISM, startDate: "2023-11-30" },
//   "137": { chain: CHAIN.POLYGON, startDate: "2024-02-05" },
//   "8453": { chain: CHAIN.BASE, startDate: "2024-04-03" },
//   "5000": { chain: CHAIN.MANTLE, startDate: "2024-05-28" },
//   "1": { chain: CHAIN.ETHEREUM, startDate: "2024-06-13" },
//   "1329": { chain: CHAIN.SEI, startDate: "2024-10-18" },
//   "43114": { chain: CHAIN.AVAX, startDate: "2024-11-07" },
//   "900900900": { chain: CHAIN.SOLANA, startDate: "2024-11-29" },
//   "2818": { chain: CHAIN.MORPH, startDate: "2024-12-17" },
//   "146": { chain: CHAIN.SONIC, startDate: "2024-12-31" },
//   "80094": { chain: CHAIN.BERACHAIN, startDate: "2025-03-07" },
//   "1514": { chain: CHAIN.STORY, startDate: "2025-03-07" },
//   "34443": { chain: CHAIN.MODE, startDate: "2025-03-19" },
//   "98866": { chain: CHAIN.PLUME, startDate: "2025-05-14" },
//   "2741": { chain: CHAIN.ABSTRACT, startDate: "2025-05-29" },
//   "56": { chain: CHAIN.BSC, startDate: "2025-06-27" },
//   "143": { chain: CHAIN.MONAD, startDate: "2025-11-24" },
// };

const chainConfig: Record<string, { chainId: number, start: string }> = {
  [CHAIN.ARBITRUM]: { chainId: 42161, start: "2023-10-26" },
  [CHAIN.OPTIMISM]: { chainId: 10, start: "2023-11-30" },
  [CHAIN.POLYGON]: { chainId: 137, start: "2024-02-05" },
  [CHAIN.BASE]: { chainId: 8453, start: "2024-04-03" },
  [CHAIN.MANTLE]: { chainId: 5000, start: "2024-05-28" },
  [CHAIN.ETHEREUM]: { chainId: 1, start: "2024-06-13" },
  [CHAIN.SEI]: { chainId: 1329, start: "2024-10-18" },
  [CHAIN.AVAX]: { chainId: 43114, start: "2024-11-07" },
  [CHAIN.SOLANA]: { chainId: 900900900, start: "2024-11-29" },
  [CHAIN.MORPH]: { chainId: 2818, start: "2024-12-17" },
  [CHAIN.SONIC]: { chainId: 146, start: "2024-12-31" },
  [CHAIN.BERACHAIN]: { chainId: 80094, start: "2025-03-07" },
  [CHAIN.STORY]: { chainId: 1514, start: "2025-03-07" },
  [CHAIN.MODE]: { chainId: 34443, start: "2025-03-19" },
  [CHAIN.PLUME]: { chainId: 98866, start: "2025-05-14" },
  [CHAIN.ABSTRACT]: { chainId: 2741, start: "2025-05-29" },
  [CHAIN.BSC]: { chainId: 56, start: "2025-06-27" },
  [CHAIN.MONAD]: { chainId: 143, start: "2025-11-24" },
}

const fetch = async (options: FetchOptions) => {
  const chain = options.chain;
  const startOfDay = options.startOfDay;
  const data: DailyStats[] = await fetchURL(apiEVM);

  // Find the stats for the requested date
  const dailyStats = data.find((day) => day.date.startsWith(options.dateString));

  if (!dailyStats)
    return {
      dailyVolume: "0",
    };

  const volume = dailyStats.volumeBreakdown?.find(
    (b) => b.chainId === chainConfig[chain].chainId.toString()
  )?.volume;

  return {
    dailyVolume: volume?.toString() || "0",
  };
};

const adapter: SimpleAdapter = {
  fetch,
  adapter: chainConfig
};

export default adapter;
