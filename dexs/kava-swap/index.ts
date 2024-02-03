import { FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import fetchURL from "../../utils/fetchURL";
import { getPrices } from "../../utils/prices";


interface ITokenInfo {
  id: string;
  decimals: number | 0;
  symbol: string;
}
interface ICallPoolData {
  denom: string;
  amount: string;
}

interface IVolumeall {
  id: string;
  decimals: number | 0;
  symbol: string;
  amount: number;
}

const URL = "https://swap-data.kava.io/v1/pools/internal";

const convertSymbol = (symbol: string): ITokenInfo => {
  switch (symbol) {
    case 'bnb':
      return { id: 'binancecoin', decimals: 8, symbol: 'WBNB' };
    case 'btcb':
      return { id: 'bitcoin', decimals: 8, symbol: 'WBTC' };
    case 'busd':
      return { id: 'binance-usd', decimals: 8, symbol: 'BUSD' };
    case 'hard':
      return { id: 'kava-lend', decimals: 6, symbol: 'HARD' };
    case 'hbtc':
      return { id: 'bitcoin', decimals: 8, symbol: 'WBTC' };
    case 'swp':
      return { id: 'kava-swap', decimals: 6, symbol: 'SWP' };
    case 'ukava':
      return { id: 'kava', decimals: 6, symbol: 'KAVA' };
    case 'xrpb':
      return { id: 'ripple', decimals: 8, symbol: 'XRP' };
    case 'ibc/B448C0CA358B958301D328CCDC5D5AD642FC30A6D3AE106FF721DB315F3DDE5C':
      return { id: 'terrausd', decimals: 6, symbol: 'UST' };
    case 'ibc/27394FB092D2ECCD56123C74F36E4C1F926001CEADA9CA97EA622B25F41E5EB2':
      return { id: 'cosmos', decimals: 6, symbol: 'ATOM' };
    case 'usdx':
      return { id: 'usdx', decimals: 6, symbol: 'USDX' };
    case 'ibc/799FDD409719A1122586A629AE8FCA17380351A51C1F47A80A1B8E7F2A491098':
      return { id: 'akash-network', decimals: 6, symbol: 'AKT' };
    case 'ibc/0471F1C4E7AFD3F07702BEF6DC365268D64570F7C1FDC98EA6098DD6DE59817B':
        return { id: 'osmosis', decimals: 6, symbol: 'OSMO' };
    case 'ibc/B8AF5D92165F35AB31F3FC7C7B444B9D240760FA5D406C49D24862BD0284E395':
        return { id: 'lunatics', decimals: 6, symbol: 'LUNA' };
    default:
      return { id: '', decimals: 0, symbol: ''}
  }
}

const fetch = async (timestamp: number): Promise<FetchResult> => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  const poolCall = (await fetchURL(URL))?.data;
  const poolDetail = poolCall
    .map((pool: any) => pool.volume
    .map((p: ICallPoolData) => p)).flat();
  const pools: IVolumeall[]  = poolDetail.map((e:ICallPoolData) => {
    const info = convertSymbol(e.denom);
    return {
      amount: Number(e.amount) / 10 ** info.decimals,
      ...info
    }
  });
  const id = pools.map((p: IVolumeall) => `coingecko:${p.id}`);
  const prices = await getPrices(id, dayTimestamp);
  const dailyVolume = pools
    .map((p: IVolumeall) => p.amount * prices[`coingecko:${p.id}`.toLowerCase()].price)
    .reduce((a: number, b: number) => a + b, 0);

  return {
    dailyVolume: dailyVolume.toString(),
    timestamp: dayTimestamp
  }
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.KAVA]: {
      fetch,
      start: 0,
      runAtCurrTime: true
    },
  },
};

export default adapter;
