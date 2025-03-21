import * as sdk from "@defillama/sdk";
import { Chain } from "@defillama/sdk/build/general";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getChainVolume } from "../../helpers/getUniSubgraphVolume";
import request, { gql } from "graphql-request";


const endpoints = {
  [CHAIN.AVAX]: sdk.graph.modifyEndpoint('BL45YVVLVkCRGaAtyTjvuRt1yHnUt4QbZg8bWcZtLvLm'),
  [CHAIN.BSC]: sdk.graph.modifyEndpoint('CxWDreK8yXVX9qxLTNoyTrcNT2uojrPiseC7mBqRENem'),
  [CHAIN.FANTOM]: sdk.graph.modifyEndpoint('B1TxafnDavup8z9rwi5TKDwZxCBR24tw8sFeyLSShhiP'),
  [CHAIN.POLYGON]: sdk.graph.modifyEndpoint('Bn68xGN5mLu9cAVgCNrACxXWf5FR1dDQ6JxvXzimd7eZ'),
  [CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint('9wYUKdu85CGGwiV8mawEUwMhj4go7dx6ezfSkh9DUrFa'),
  [CHAIN.OPTIMISM]: sdk.graph.modifyEndpoint('F7nNhkyaR53fs14vhfJmsUAotN1aJiyMbVc677ngFHWU'),
  [CHAIN.ERA]: "https://api.studio.thegraph.com/query/45576/woofi-zksync/version/latest",
  [CHAIN.POLYGON_ZKEVM]: "https://api.studio.thegraph.com/query/71937/woofi-polygon-zkevm/version/latest",
  [CHAIN.LINEA]: "https://api.studio.thegraph.com/query/71937/woofi-linea/version/latest",
  [CHAIN.BASE]: "https://api.studio.thegraph.com/query/71937/woofi-base/version/latest",
  [CHAIN.MANTLE]: "https://subgraph-api.mantle.xyz/api/public/9e9d6e8a-be9d-42d1-9747-3a8f001214c5/subgraphs/woonetwork/woofi-mantle/v0.0.1/gn",
  [CHAIN.SONIC]: sdk.graph.modifyEndpoint('7dkVEmyCHvjnYYUJ9DR1t2skkZrdbfSWpK6wpMbF9CEk'),
};

type TStartTime = {
  [l: string | Chain]: number;
}
const startTime: TStartTime = {
  [CHAIN.AVAX]: 1645228800,
  [CHAIN.BSC]: 1635206400,
  [CHAIN.FANTOM]: 1649808000,
  [CHAIN.POLYGON]: 1656028800,
  [CHAIN.ARBITRUM]: 1667520000,
  [CHAIN.OPTIMISM]: 1669161600,
  [CHAIN.ERA]: 1680652800,
  [CHAIN.POLYGON_ZKEVM]: 1688515200,
  [CHAIN.LINEA]: 1691625600,
  [CHAIN.BASE]: 1692057600,
  [CHAIN.MANTLE]: 1706659200,
  [CHAIN.SONIC]: 1734480000,
};

const TOTAL_VOLUME_FACTORY = "globalVariables";
const TOTAL_VOLUME_FIELD = "totalVolumeUSD";

const DAILY_VOLUME_FACTORY = "dayData";
const DAILY_VOLUME_FIELD = "volumeUSD";

const graphs = getChainVolume({
  graphUrls: endpoints,
  totalVolume: {
    factory: TOTAL_VOLUME_FACTORY,
    field: TOTAL_VOLUME_FIELD,
  },
  dailyVolume: {
    factory: DAILY_VOLUME_FACTORY,
    field: DAILY_VOLUME_FIELD,
    dateField: 'timestamp'
  },
});

const dailyQuery = gql`
  query getDailyVolume($Id: Int!) {
    dayData(id: $Id) {
      volumeUSD
    },
    globalVariables {
      totalVolumeUSD
    }
  }
`

interface FetchResult {
  dayData: {
    volumeUSD: string;
  }
  globalVariables: Array<{
    totalVolumeUSD: string;
  }>
}
const fetch = async (_t: any, _c: any,options: FetchOptions) => {
  try {
    console.log('fetching volume for', options.startOfDay);
    const dateId = Math.floor(options.startOfDay / 86400);
    const response: FetchResult = await request(endpoints[options.chain], dailyQuery, { Id: dateId });
    if (!response) return {};
    return {
      dailyVolume: Number(response?.dayData?.volumeUSD || 0) / 1e18,
      totalVolume: Number(response?.globalVariables[0]?.totalVolumeUSD || 0) / 1e18,
    };
  } catch (error) {
    console.error(error);
    return {};
  }
}

const volume = Object.keys(endpoints).reduce(
  (acc, chain) => ({
    ...acc,
    [chain]: {
      fetch: fetch,
      start: startTime[chain],
    },
  }),
  {}
);

const adapter: SimpleAdapter = {
  version: 1,
  adapter: volume,
};
export default adapter;
