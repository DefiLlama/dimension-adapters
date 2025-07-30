import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { SimpleAdapter } from "../../adapters/types";

const fetch = univ2Adapter({
  endpoints: {
    [CHAIN.BSC]: sdk.graph.modifyEndpoint('6YsqBAMACpzsx2GktPSfCcfAs1C4WZzqcUk1mBWwFxtN'),
    [CHAIN.XDAI]: "https://api.thegraph.com/subgraphs/name/zikyfranky/empire-xdai",
    [CHAIN.POLYGON]: sdk.graph.modifyEndpoint('57ZPKjowRMAcH4j4pTz6Aig2wm4LyjUStuUiETVRTmdF'),
    [CHAIN.AVAX]: sdk.graph.modifyEndpoint('BpubdJRtMZpkrodAbbkm43m8d3AeT5tBkTxShb6Eu8hc'),
  },
});

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.BSC]: { fetch, start: 1629251617 },
  },
}

export default adapter;
