import { SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'
import { getDexVolume } from '../../helpers/dexVolumeLogs'

// see https://docs.velocimeter.xyz/security#v2-contract-addresses
const FACTORY_ADDRESS = '0xF80909DF0A01ff18e4D37BF682E40519B21Def46'

const fetch = async (timestamp: number) => {
  const fromTimestamp = timestamp - 60 * 60 * 24
  const toTimestamp = timestamp
  return getDexVolume({ chain: CHAIN.CANTO, fromTimestamp, toTimestamp, factory: FACTORY_ADDRESS, timestamp })
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.CANTO]: {
      fetch,
      start: async () => 1678512026, // when PairFactory was created https://tuber.build/address/0xF80909DF0A01ff18e4D37BF682E40519B21Def46
    },
  },
}

export default adapter
