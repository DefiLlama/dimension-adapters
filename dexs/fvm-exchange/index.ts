import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getDexVolume } from "../../helpers/dexVolumeLogs";

const FACTORY_ADDRESS = '0x472f3C3c9608fe0aE8d702f3f8A2d12c410C881A'

const fetch = async (timestamp: number) => {
  const fromTimestamp = timestamp - 60 * 60 * 24
  const toTimestamp = timestamp
  return getDexVolume({ chain: CHAIN.FANTOM, fromTimestamp, toTimestamp, factory: FACTORY_ADDRESS, timestamp })
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.FANTOM]: {
      fetch,
      start: async () => 1688172646, // when PairFactory was created https://ftmscan.com/address/0x472f3C3c9608fe0aE8d702f3f8A2d12c410C881A
    },
  },
}

export default adapter