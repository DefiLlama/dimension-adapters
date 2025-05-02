import { CHAIN } from "../../helpers/chains";
import { uniV2Exports } from "../../helpers/uniswap";

export default uniV2Exports({
  [CHAIN.OPTIMISM]: { factory: "0x25CbdDb98b35ab1FF77413456B31EC81A6B6B746", fees: 0.0005, stableFees: 0.0002, start: '2023-02-23' },
})