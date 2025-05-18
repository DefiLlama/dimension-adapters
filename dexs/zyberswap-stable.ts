import { CHAIN } from "../helpers/chains";
import { getSaddleExports } from "../helpers/saddle";

export default getSaddleExports({
  [CHAIN.ARBITRUM]: { pools: ['0x969f7699fbB9C79d8B61315630CDeED95977Cfb8']}
})
