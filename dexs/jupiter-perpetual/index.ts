import ADDRESSES from "../../helpers/coreAssets.json";
import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const MARKET_MINTS = [
  ADDRESSES.solana.SOL,
  "3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh",
  "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs",
];

const fetch = async (_options: FetchOptions): Promise<FetchResult> => {
  let dailyVolume = 0;
  for (const mint of MARKET_MINTS) {
    const stats = await httpGet(`https://perps-api.jup.ag/v1/market-stats?mint=${mint}`);
    const volume = Number(stats?.volume);
    if (typeof stats?.volume !== "string" || stats.volume.trim() === "" || !Number.isFinite(volume) || volume < 0) {
      throw new Error(`Invalid Jupiter perpetual market volume for mint ${mint}`);
    }
    dailyVolume += volume;
  }

  return {
    dailyVolume,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.SOLANA],
  runAtCurrTime: true,
  pullHourly: false,
  start: "2024-01-23",
  methodology: {
    Volume: "24-hour USD trading volume across Jupiter's SOL, BTC and ETH perpetual markets.",
  },
};

export default adapter;
