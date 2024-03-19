import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";

const endpoints = {
  [CHAIN.ARBITRUM]: "https://api.thegraph.com/subgraphs/name/solidlizardfinance/sliz",
};

const adapter = univ2Adapter(endpoints, {});

adapter.adapter.arbitrum.start = 1675036800;

export default adapter
