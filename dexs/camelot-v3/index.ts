import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter2 } from "../../helpers/getUniSubgraphVolume";
import { SimpleAdapter } from "../../adapters/types";
import { getEnv } from "../../helpers/env";

const chainConfig = {
  [CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint('7mPnp1UqmefcCycB8umy4uUkTkFxMoHn1Y7ncBUscePp'),
  // [CHAIN.APECHAIN]: `https://subgraph.satsuma-prod.com/${getEnv('CAMELOT_API_KEY')}/camelot/camelot-ammv3-apechain/api`,
  // [CHAIN.GRAVITY]: `https://subgraph.satsuma-prod.com/${getEnv('CAMELOT_API_KEY')}/camelot/camelot-ammv3-gravity/api`,
  // [CHAIN.RARI]: `https://subgraph.satsuma-prod.com/${getEnv('CAMELOT_API_KEY')}/camelot/camelot-ammv3-rari/api`,
  // [CHAIN.REYA]: `https://subgraph.satsuma-prod.com/${getEnv('CAMELOT_API_KEY')}/camelot/camelot-ammv3-reya/api`,
  // [CHAIN.XDAI]: `https://subgraph.satsuma-prod.com/${getEnv('CAMELOT_API_KEY')}/camelot/camelot-ammv3-xai/api`,
  // [CHAIN.SANKO]: `https://subgraph.satsuma-prod.com/${getEnv('CAMELOT_API_KEY')}/camelot/camelot-ammv3-sanko/api`,
}

const fetch = univ2Adapter2({
  endpoints: chainConfig,
  factoriesName: "factories",
  totalVolume: "totalVolumeUSD",
})

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: Object.keys(chainConfig),
  start: '2023-03-31'
}

export default adapter;
