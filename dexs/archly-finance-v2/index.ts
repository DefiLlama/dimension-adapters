import { CHAIN } from "../../helpers/chains";
import { uniV2Exports } from "../../helpers/uniswap";

const factory = '0x12508dd9108Abab2c5fD8fC6E4984E46a3CF7824';
const FACTORY_ADDRESS_ZKSYNC = '0x30A0DD3D0D9E99BD0E67b323FB706788766dCff2';
const FACTORY_ADDRESS_ETHERUEM = '0xE8E2b714C57937E0b29c6ABEAF00B52388cAb598';


export default uniV2Exports({
  [CHAIN.ARBITRUM_NOVA]: { factory },
  [CHAIN.ARBITRUM]: { factory },
  [CHAIN.AVAX]: { factory },
  [CHAIN.BASE]: { factory },
  [CHAIN.BLAST]: { factory },
  [CHAIN.BSC]: { factory },
  [CHAIN.CRONOS]: { factory },
  [CHAIN.ETHEREUM]: { factory: FACTORY_ADDRESS_ETHERUEM },
  [CHAIN.FANTOM]: { factory },
  [CHAIN.FILECOIN]: { factory },
  [CHAIN.FRAXTAL]: { factory },
  [CHAIN.KAVA]: { factory },
  [CHAIN.MANTLE]: { factory },
  [CHAIN.METIS]: { factory },
  [CHAIN.MODE]: { factory },
  [CHAIN.NEON]: { factory },
  [CHAIN.OPTIMISM]: { factory },
  [CHAIN.POLYGON]: { factory },
  [CHAIN.SONIC]: { factory },
  [CHAIN.TELOS]: { factory },
  [CHAIN.ERA]: { factory: FACTORY_ADDRESS_ZKSYNC },
  [CHAIN.ZORA]: { factory },
})