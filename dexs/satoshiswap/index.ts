// https://subgraph.satoshiswap.exchange/subgraphs/name/pancakeswap/exchange
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";

const endpoints = {
  [CHAIN.CORE]: "https://subgraph.satoshicoreswap.com/subgraphs/name/pancakeswap/exchange",
};

const adapter = univ2Adapter(endpoints, {
  factoriesName: "pancakeFactories",
  dayData: "pancakeDayData",
});

adapter.adapter.core.start = async()=> 1680825600;

export default adapter
