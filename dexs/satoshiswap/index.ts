// https://subgraph.satoshiswap.exchange/subgraphs/name/pancakeswap/exchange
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";

const endpoints = {
  [CHAIN.CORE]: "https://subgraph.satoshiswap.exchange/subgraphs/name/pancakeswap/exchange",
};

const adapter = univ2Adapter(endpoints, {});

adapter.adapter.core.start = async()=> 1680700002;

export default adapter