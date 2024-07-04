import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const endpoints = {
  [CHAIN.FANTOM]: sdk.graph.modifyEndpoint('3kxULFsyJPAqbtCQUtQBH4Hktd6EboqCF22cVtkZg1eY'),
};
const adapter = univ2Adapter(endpoints, {"gasToken" : "coingecko:fantom"});
adapter.adapter.fantom.start = 1650883041;

export default adapter
