import fetchURL from "../../utils/fetchURL"
import { CHAIN } from "../../helpers/chains"
import { FetchOptions } from "../../adapters/types"

const endpoint = "https://tonfunstats-eqnd7.ondigitalocean.app/api/v1/getVolume"

const fetch = async ({ startTimestamp, endTimestamp, createBalances, }: FetchOptions) => {
  const res = await fetchURL(`${endpoint}?from=${startTimestamp}&to=${endTimestamp}&service=blum`)
  const TON = "coingecko:the-open-network"

  const dailyVolume = createBalances()
  dailyVolume.addCGToken('the-open-network', res.volume / 1e9)
  return {
    dailyVolume,
  }
}

const adapter = {
  version: 2,
  adapter: {
    [CHAIN.TON]: {
      fetch,
      start: '2024-10-24',
    },
  },
  // tonfunstats-eqnd7.ondigitalocean.app is NXDOMAIN, so this adapter has no host to query.
  // Last published point 2025-10-31 ($93) and TVL reads 0.
  deadFrom: '2025-11-01',
}

export default adapter
