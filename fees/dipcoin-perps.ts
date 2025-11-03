import { httpGet } from "../utils/fetchURL";
import { FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import BigNumber from "bignumber.js";

const fetch = async (_: number): Promise<FetchResultFees> => {
  const symbols = (
    await httpGet("https://gray-api.dipcoin.io/api/perp-market-api/list")
  )?.data?.map((i: any) => i.symbol);
  const volumes = await Promise.all(
    symbols.map(async (symbol: string) => {
      const ticker = await httpGet(
        `https://gray-api.dipcoin.io/api/perp-market-api/ticker?symbol=${symbol}`
      );
      const volumeValue = ticker?.data?.volume24h || 0;

      return BigNumber(volumeValue);
    })
  );

  const fees = volumes
    .reduce((acc, volume) => acc.plus(volume), BigNumber(0))
    .div(1e18)
    .multipliedBy(0.0004)
    .toNumber();

  return {
    dailyFees: fees,
    dailyRevenue: fees,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.SUI]: {
      fetch,
      start: "2025-10-15",
      runAtCurrTime: true,
    },
  },
};

export default adapter;
