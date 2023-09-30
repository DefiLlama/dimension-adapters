import fetchURL from "../../utils/fetchURL"
import { SimpleAdapter, Fetch } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const historicalVolumeEndpoint = (symbol: string, endTime: number) => `https://pro.apex.exchange/api/v1/klines?end=${endTime}&interval=D&start=1664928000&symbol=${symbol}`

interface IVolumeall {
    id: string;
    volume: string;
    timestamp: number;
    price: string;
    volumeUSD: number;
}
const symbol: string[] = [
  'BTCUSDC',   'ETHUSDC',
  'AVAXUSDC',  '1000PEPEUSDC',
  'ARBUSDC',   'XRPUSDC',
  'ATOMUSDC',  'DOGEUSDC',
  'MATICUSDC', 'OPUSDC',
  'SOLUSDC',   'BNBUSDC',
  'LTCUSDC',   'APTUSDC',
  'LDOUSDC',   'BLURUSDC',
  'BCHUSDC',   'ETCUSDC',
  'WLDUSDC'
]
const getVolume = async (timestamp: number) => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
    const historical: any[] = (await Promise.all(symbol.map((coins: string) => fetchURL(historicalVolumeEndpoint(coins, dayTimestamp + 60 * 60 * 24)))))
        .map((e: any) => Object.values(e.data.data)).flat().flat()
        .map((e: any) => { return { timestamp: e.t / 1000, volume: e.v, price: e.c } });
    const historicalUSD = historical.map((e: IVolumeall) => {
        return {
            ...e,
            volumeUSD: Number(e.volume) * Number(e.price)
        }
    });
    const dailyVolume = historicalUSD.filter((e: IVolumeall) => e.timestamp === dayTimestamp)
        .reduce((a: number, { volumeUSD }) => a + volumeUSD, 0);
    const totalVolume = historicalUSD.filter((e: IVolumeall) => e.timestamp <= dayTimestamp)
        .reduce((a: number, { volumeUSD }) => a + volumeUSD, 0);
    return {
        totalVolume: `${totalVolume}`,
        dailyVolume: dailyVolume ? `${dailyVolume}` : undefined,
        timestamp: dayTimestamp,
    };
};


const adapter: SimpleAdapter = {
    adapter: {
        [CHAIN.ETHEREUM]: {
            fetch: getVolume,
            start: async () => 1664928000,
        }
    },
};

export default adapter;
