import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";

const endpoints = {
  [CHAIN.ETHEREUM]: "https://api.thegraph.com/subgraphs/name/0xc30/solidly",
};

const adapter = univ2Adapter(endpoints, {});

adapter.adapter.ethereum.start = async()=> 1672444800;

export default adapter
