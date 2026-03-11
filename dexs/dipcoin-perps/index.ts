import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";
import BigNumber from "bignumber.js";

const fetch = async () => {
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
  const sum = volumes
    .reduce((acc, volume) => acc.plus(volume), BigNumber(0))
    .div(1e18)
    .toNumber();
  
  const fees = volumes
    .reduce((acc, volume) => acc.plus(volume), BigNumber(0))
    .div(1e18)
    .multipliedBy(0.0004)
    .toNumber();

  return {
    dailyVolume: sum,
    dailyFees: fees,
    dailyRevenue: fees,
    dailyProtocolRevenue: fees,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.SUI]: {
      fetch: fetch,
      runAtCurrTime: true,
    },
  },
  methodology: {
    Fees: 'Perps trading fees paid by users.',
    Revenue: 'All perps trading fees are revenue.',
    ProtocolRevenue: 'All perps trading fees are revenue.',
  }
};

export default adapter;
