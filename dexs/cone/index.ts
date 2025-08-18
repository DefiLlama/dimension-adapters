import { CHAIN } from "../../helpers/chains";
import { SimpleAdapter } from "../../adapters/types";
import { getUniV2LogAdapter } from "../../helpers/uniswap";

const adapter: SimpleAdapter = {
  version: 2,
  fetch: getUniV2LogAdapter({ factory: '0x0EFc2D2D054383462F2cD72eA2526Ef7687E1016' }),
  chains: [CHAIN.BSC],
  start: 1626677527
}

export default adapter;