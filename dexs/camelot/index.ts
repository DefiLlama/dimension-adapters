import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter2 } from "../../helpers/getUniSubgraphVolume";
import { SimpleAdapter } from "../../adapters/types";
import { getEnv } from "../../helpers/env";

const chainConfig: Record<string, string> = {
  [CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint('8zagLSufxk5cVhzkzai3tyABwJh53zxn9tmUYJcJxijG'),
  [CHAIN.APECHAIN]: `https://subgraph.satsuma-prod.com/${getEnv('CAMELOT_API_KEY')}/camelot/camelot-ammv2-apechain/api`,
  [CHAIN.GRAVITY]: `https://subgraph.satsuma-prod.com/${getEnv('CAMELOT_API_KEY')}/camelot/camelot-ammv2-gravity/api`,
  [CHAIN.RARI]: `https://subgraph.satsuma-prod.com/${getEnv('CAMELOT_API_KEY')}/camelot/camelot-ammv2-rari/api`,
  [CHAIN.REYA]: `https://subgraph.satsuma-prod.com/${getEnv('CAMELOT_API_KEY')}/camelot/camelot-ammv2-reya/api`,
  [CHAIN.XDAI]: `https://subgraph.satsuma-prod.com/${getEnv('CAMELOT_API_KEY')}/camelot/camelot-ammv2-xai/api`,
  [CHAIN.SANKO]: `https://subgraph.satsuma-prod.com/${getEnv('CAMELOT_API_KEY')}/camelot/camelot-ammv2-sanko/api`,
}

const fetch = univ2Adapter2({
  endpoints: chainConfig,
  factoriesName: 'uniswapFactories',
  totalVolume: 'totalVolumeUSD',
})

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: Object.keys(chainConfig),
  start: '2022-11-11'
}

export default adapter;
