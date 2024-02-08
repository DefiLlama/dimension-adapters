import { SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'
import { getDexVolumeExports } from '../../helpers/dexVolumeLogs'

// see https://docs.velocimeter.xyz/security#v2-contract-addresses
const FACTORY_ADDRESS = '0xF80909DF0A01ff18e4D37BF682E40519B21Def46'

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.CANTO]: {
      fetch: getDexVolumeExports({ chain: CHAIN.CANTO, factory: FACTORY_ADDRESS }),
      start: 1678512026, // when PairFactory was created https://tuber.build/address/0xF80909DF0A01ff18e4D37BF682E40519B21Def46
    },
  },
}

export default adapter
