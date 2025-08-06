import { CHAIN } from "../../helpers/chains";
import { getUniV2LogAdapter } from "../../helpers/uniswap";
import { SimpleAdapter } from "../../adapters/types";

// const fetch = univ2Adapter({
//   endpoints: {
//     [CHAIN.BSC]: sdk.graph.modifyEndpoint('7APt1aJ4g5VJqcKF47if3kDjsNSG8mHPGv9YSt8Qf39i')
//   },
//   factoriesName: "pancakeFactories",
//   dayData: "pancakeDayData",
// });

const adapter: SimpleAdapter = {
  version: 2,
  fetch: getUniV2LogAdapter({ factory: '0x940BEb635cbEeC04720AC97FADb97205676e6aa4' }),
  chains: [CHAIN.BSC],
  start: 1663921255,
}

export default adapter;
