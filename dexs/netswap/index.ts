import { CHAIN } from "../../helpers/chains";
import { SimpleAdapter } from "../../adapters/types";
import { getUniV2LogAdapter } from "../../helpers/uniswap";

// const fetch = univ2Adapter({
//   endpoints: {
//     [CHAIN.METIS]: "https://andromeda.thegraph.metis.io/subgraphs/name/netswap/exchange"
//   },
//   factoriesName: "netswapFactories",
//   dayData: "netswapDayData"
// });

const getUniV2LogAdapterConfig = {
  fees: 0.003, // 0.3%
  userFeesRatio: 1,
  revenueRatio: 0.05 / 0.3,
  protocolRevenueRatio: 1,
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch: getUniV2LogAdapter({ factory: '0x70f51d68D16e8f9e418441280342BD43AC9Dff9f', ...getUniV2LogAdapterConfig }),
  chains: [CHAIN.METIS],
  start: 1638760703,
}

export default adapter;
