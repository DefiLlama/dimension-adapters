import { CHAIN } from "../../helpers/chains";
import { uniV2Exports } from "../../helpers/uniswap";

export default uniV2Exports({
  [CHAIN.CANTO]: { factory: '0xE387067f12561e579C5f7d4294f51867E0c1cFba', blacklistedAddresses: [
    '0x76200899Ee4CCAC8FCa5CF3E6976BAE71e25f3ED'
  ]},
}, { runAsV1: true })
