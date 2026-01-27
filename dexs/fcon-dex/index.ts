import { CHAIN } from "../../helpers/chains";
import { uniV2Exports } from "../../helpers/uniswap";

const adapters = uniV2Exports({
  [CHAIN.MANTLE]: { factory: '0x3eF942017d51BA257c4B61BE2f8f641209C8b341'}
});

adapters.deadFrom = '2023-12-12';

export default adapters;
