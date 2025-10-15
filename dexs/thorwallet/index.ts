import { SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'
import { getUniqStartOfTodayTimestamp } from '../../helpers/getUniSubgraphVolume'
import { httpGet } from '../../utils/fetchURL'

const historicalVolumeEndpoint =
  'https://midgard.thorwallet.org/v2/history/swaps?interval=day&count=100'

interface IVolumeall {
  totalFees: string
  toAssetFees: string
  runePriceUSD: string
  synthRedeemFees: string
  synthMintFees: string
  toRuneFees: string
  totalVolume: string
  startTime: string
  toRuneVolume: string
}

const calVolume = (total: IVolumeall): number => {
  const runePriceUSD = Number(total?.runePriceUSD || 0)
  const volume = (Number(total.totalVolume || 0) / 1e8) * runePriceUSD
  return volume
}

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const historicalVolume: IVolumeall[] = (await httpGet(historicalVolumeEndpoint)).intervals
  const dailyVolumeCall = historicalVolume.find(
    (dayItem: IVolumeall) => Number(dayItem.startTime) === dayTimestamp
  )
  const dailyVolume = calVolume(dailyVolumeCall as IVolumeall)

  return {
    dailyVolume: dailyVolume,
    timestamp: dayTimestamp,
  }
}

const getStartTimestamp = async () => {
  const historicalVolume: IVolumeall[] = (await httpGet(historicalVolumeEndpoint)).intervals
  return Number(historicalVolume[0]?.startTime)
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.THORCHAIN]: {
      fetch,
      start: getStartTimestamp,
    },
  },
}

export default adapter
