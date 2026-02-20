import fetchURL from "../../utils/fetchURL"
import type { SimpleAdapter } from "../../adapters/types";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";

type TMarket = {
  [s: string]: {
    baseVolume: number;
    usdVolume24h: number;
    usdVolumeAll: number;
  }
}

type TMarketInfo = {
  [s: string]: {
    baseAsset: {
      usdPrice: number;
    };
  }
}


const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const markets: TMarket = (await fetchURL('https://api.zklite.io/api/v1/markets'));
  const marketInfos: TMarketInfo = (await fetchURL('https://api.zklite.io/api/v1/marketinfos?chain_id=1&market=' + Object.keys(markets).join(',')));
  let dailyVolume = 0
  Object.keys(markets).forEach(market => {
    const { baseVolume, usdVolume24h, } = markets[market]
    if (usdVolume24h) {
      dailyVolume += usdVolume24h;
      return;
    }

    const info = marketInfos[market]
    if (!info) return;
    dailyVolume += baseVolume * info.baseAsset.usdPrice;
  })
  return {
    dailyVolume,
    timestamp: dayTimestamp,
  };
};

const adapter: SimpleAdapter = {
  deadFrom: "2025-01-01",
  adapter: {
    [CHAIN.ZKSYNC]: {
      fetch,
      runAtCurrTime: true,
      start: '2024-04-10',
    },
  }
};

export default adapter;
