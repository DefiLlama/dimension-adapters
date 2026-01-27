import fetchURL from "../utils/fetchURL"
import { FetchOptions, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"

const fetch = async ({ createBalances }: FetchOptions) => {
  const dailyVolume = createBalances()
  const { volume } = await fetchURL(`https://dex.penumbra.zone/api/stats`)

  if (volume.value.knownAssetId.metadata.symbol !== 'USDC')
    throw new Error('Unknown asset id')

  dailyVolume.addCGToken('usd-coin', volume.value.knownAssetId.amount.lo / 1e6)
  return { dailyVolume, }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.PENUMBRA]: {
      fetch,
      runAtCurrTime: true
    },
  },
}

export default adapter
