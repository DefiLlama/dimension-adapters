// https://subgraph.satoshiswap.exchange/subgraphs/name/pancakeswap/exchange
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";
import { DISABLED_ADAPTER_KEY } from "../../adapters/types";
import disabledAdapter from "../../helpers/disabledAdapter";

const endpoints = {
  [CHAIN.CORE]: "https://subgraph.satoshicoreswap.com/subgraphs/name/pancakeswap/exchange",
};

const adapter = univ2Adapter(endpoints, {
  factoriesName: "pancakeFactories",
  dayData: "pancakeDayData",
});

adapter.adapter.core.start = 1680825600;
adapter.adapter[DISABLED_ADAPTER_KEY] = disabledAdapter;
export default adapter
