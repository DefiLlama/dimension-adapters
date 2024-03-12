import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getDexFeesExports } from "../helpers/dexVolumeLogs";

const FACTORY_ADDRESS_ETH = '0xC480b33eE5229DE3FbDFAD1D2DCD3F3BAD0C56c6';
const FACTORY_ADDRESS_ARB = '0x717EF162cf831db83c51134734A15D1EBe9E516a'

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: getDexFeesExports({ chain: CHAIN.ETHEREUM, factory: FACTORY_ADDRESS_ETH }),
      start: async () => 1685825743,
    },
    [CHAIN.ARBITRUM]: {
        fetch: getDexFeesExports({ chain: CHAIN.ARBITRUM, factory: FACTORY_ADDRESS_ARB }),
        start: async () => 1657745743,
      },
  }
};

export default adapter;