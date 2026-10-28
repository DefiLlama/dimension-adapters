import { SimpleAdapter, FetchOptions } from '../../adapters/types';import { CHAIN } from '../../helpers/chains'
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

const fetch = async (options: FetchOptions) => {
  const historicalVolume: IVolumeall[] = (await httpGet(historicalVolumeEndpoint)).intervals
  const dailyVolumeCall = historicalVolume.find(
    (dayItem: IVolumeall) => Number(dayItem.startTime) === options.startOfDay
  )
  const dailyVolume = calVolume(dailyVolumeCall as IVolumeall)

  return { dailyVolume }
}

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.THORCHAIN],
}

export default adapter
