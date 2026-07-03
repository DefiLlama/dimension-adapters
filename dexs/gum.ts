import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";
import { PromisePool } from "@supercharge/promise-pool";
import { sleep } from "../utils/utils";

const GUM_MARKETS_URL = "https://gum-api.jup.net/fe/mainnet-beta/perps/markets";

async function fetch(options: FetchOptions) {
  const dailyVolume = options.createBalances();

  const marketsResponse = await fetchURL(GUM_MARKETS_URL);
  const symbols = marketsResponse.map((market: any) => market.symbol);

  await PromisePool.withConcurrency(3)
    .for(symbols).process(async (symbol) => {
      const ohlcvData = await fetchURL(`https://gum-api.jup.net/fe/mainnet-beta/perps/ohlcv/${symbol}?interval=1D&from=${options.startOfDay}&to=${options.endTimestamp}`);
      const todaysData = ohlcvData.find((data: any) => data.t === options.startOfDay * 1000);
      if (todaysData) {
        dailyVolume.addUSDValue(todaysData.v);
      }
      await sleep(500);
    });

  return {
    dailyVolume,
  };
}

const methodology = {
  Volume: "Notional volume of all trades including leverage on the perp exchange"
}

const adapter: SimpleAdapter = {
  version: 1,
  chains: [CHAIN.JUPNET],
  fetch,
  start: "2026-06-18",
  methodology,
};

export default adapter;