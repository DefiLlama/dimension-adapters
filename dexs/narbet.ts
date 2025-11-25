import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

function formatDate(timestamp: number) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}${date.getMonth() + 1}${date.getDate()}`;
}

type Stats = {
  code: number,
  data: {
    active: number,
    bets: number,
    wager: number,
    profit: number,
    nums: number,
  }
}

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  const start = formatDate(options.startTimestamp * 1000);
  const end = formatDate(options.endTimestamp * 1000);
  const url = new URL("https://api.narwhal.finance/api/v1/casino/public_analytics");
  url.searchParams.set("start", start);
  url.searchParams.set("end", end);
  const stats: Stats = await httpGet(url.toString());
  if (stats.code !== 0) {
    console.error("Server responded error", stats);
    throw new Error("Could not fetch data");
  }
  const volume = Number(stats.data.wager);

  dailyVolume.addCGToken("monad", volume);

  return {
    dailyVolume,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.MONAD],
  start: '2025-10-24',
}

export default adapter;