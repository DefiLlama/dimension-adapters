import fetchURL from "../../utils/fetchURL"
import type { SimpleAdapter } from "../../adapters/types";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";

type TMarket = {
  [s: string]: {
    baseVolume: number;
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
  const markets: TMarket = (await fetchURL('https://zigzag-exchange.herokuapp.com/api/v1/markets'));
  const marketInfos: TMarketInfo = (await fetchURL('https://zigzag-exchange.herokuapp.com/api/v1/marketinfos?chain_id=1&market=' + Object.keys(markets).join(',')));
  const amountUSD: number[] =  Object.keys(markets).map(market => {
    const info = marketInfos[market]
    const { baseVolume } = markets[market]
    if (!info)  return 0;
    return baseVolume * info.baseAsset.usdPrice;
  })
  const dailyVolume = amountUSD.reduce((a: number, b: number) => a+b, 0)
  return {
    dailyVolume: dailyVolume ? `${dailyVolume}` : undefined,
    timestamp: dayTimestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ZKSYNC]: {
      fetch,
      runAtCurrTime: true,
      customBackfill: undefined,
      start: 1679443200,
    },
  }
};

export default adapter;
