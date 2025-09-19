import fetchURL from "../../utils/fetchURL"
import { FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// const historicalVolumeEndpoint = (market: string, start: number, end: number) => `https://api.prod.paradex.trade/v1/markets/summary?market=${market}&start=${start}&end=${end}`
// const marketsEndpoint = "https://api.prod.paradex.trade/v1/markets"
const volumeEndpoint = 'https://data.prod.paradex.trade/tradeparadigm.metabaseapp.com/api/public/dashboard/e4d7b84d-f95f-48eb-b7a6-141b3dcef4e2/dashcard/18119/card/18713'
let volumeCache: { [key: string]: number } = {}
let volData: any

const fetch = async (_: number, _1: any, { dateString }: FetchOptions): Promise<FetchResultVolume> => {

  if (!volData)
    volData = fetchURL(volumeEndpoint).then(({ data: { rows } }: any) => {
      volumeCache = {}
      rows.forEach((row: any) => {
        const [date, market, volume] = row
        if (date.slice(10) !== "T00:00:00Z" || market !== 'PERP') return
        volumeCache[date.slice(0, 10)] = volume
      })
    })

  await volData
  if (!volumeCache[dateString]) throw new Error('record missing!')
  return { dailyVolume: volumeCache[dateString] }
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.PARADEX]: {
      fetch,
      start: '2023-09-01',
    },
  },
};

export default adapter; 