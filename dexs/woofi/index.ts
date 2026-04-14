import * as sdk from "@defillama/sdk";
import { Chain } from "../../adapters/types";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import request, { gql } from "graphql-request";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";
import { httpGet } from "../../utils/fetchURL";


const endpoints: Record<Chain, string> = {
  [CHAIN.AVAX]: sdk.graph.modifyEndpoint('BL45YVVLVkCRGaAtyTjvuRt1yHnUt4QbZg8bWcZtLvLm'),
  [CHAIN.BSC]: sdk.graph.modifyEndpoint('CxWDreK8yXVX9qxLTNoyTrcNT2uojrPiseC7mBqRENem'),
  [CHAIN.FANTOM]: sdk.graph.modifyEndpoint('B1TxafnDavup8z9rwi5TKDwZxCBR24tw8sFeyLSShhiP'),
  [CHAIN.POLYGON]: sdk.graph.modifyEndpoint('Bn68xGN5mLu9cAVgCNrACxXWf5FR1dDQ6JxvXzimd7eZ'),
  [CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint('9wYUKdu85CGGwiV8mawEUwMhj4go7dx6ezfSkh9DUrFa'),
  [CHAIN.OPTIMISM]: sdk.graph.modifyEndpoint('F7nNhkyaR53fs14vhfJmsUAotN1aJiyMbVc677ngFHWU'),
  [CHAIN.ERA]: sdk.graph.modifyEndpoint('DxS3HgpNUjaujQEeom9CyTmrRbLH31PYX3JdiJkgRh7D'),
  [CHAIN.POLYGON_ZKEVM]: sdk.graph.modifyEndpoint('FbGJ32HNCStF9df3M1GXQCs4MUsSY4tAPh3MZyKMV2M5'),
  [CHAIN.LINEA]: sdk.graph.modifyEndpoint('4TN6UVFc77yYu3YdUxFv6wkFXkNEeueWi8oGrAg8BcfM'),
  [CHAIN.BASE]: sdk.graph.modifyEndpoint('EHcBkzfegM51XJmxb26DcB6RmvhNTaoY692aiNHC9Bm5'),
  [CHAIN.MANTLE]: "https://woofi-subgraph.mer1in.com/subgraphs/name/woonetwork/woofi-mantle",
  [CHAIN.SONIC]: sdk.graph.modifyEndpoint('7dkVEmyCHvjnYYUJ9DR1t2skkZrdbfSWpK6wpMbF9CEk'),
  [CHAIN.BERACHAIN]: sdk.graph.modifyEndpoint('FGF5X13mGLYu2GN7pK4LYuMeS95WENHAgPDP8JDCJyTy'),
  [CHAIN.HYPERLIQUID]: "https://woofi-subgraph.mer1in.com/subgraphs/name/woonetwork/woofi-hyperevm",
  [CHAIN.MONAD]: sdk.graph.modifyEndpoint('B5oecz9PHofaQmUMP8ws2iYsNTxXhEtcghsA2jMSsJAP'),
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
  [CHAIN.BERACHAIN]: 1742256000,
  [CHAIN.SOLANA]: 1740528000,
  [CHAIN.HYPERLIQUID]: 1751328000,
  [CHAIN.MONAD]: 1764201600,
};

interface FetchResult {
  dayData: {
    volumeUSD: string;
  }
  globalVariables: Array<{
    totalVolumeUSD: string;
  }>
}
const fetchVolume = async (_t: any, _c: any,options: FetchOptions) => {
  const start = getTimestampAtStartOfDayUTC(options.endTimestamp)
  const dateId = Math.floor(start / 86400);
  const query = gql`
    {
    dayData(id: ${dateId}) {
        volumeUSD
      },
      globalVariables {
        totalVolumeUSD
      }
    }
  `;
  const response: FetchResult = (await request(endpoints[options.chain], query));
  return {
    timestamp: start,
    dailyVolume: Number(response?.dayData?.volumeUSD || 0) / 1e18,
  }
}

const fetchSolanaVolume = async (timestamp: number) => {
  const apiURL = "https://api.woofi.com/stat?period=all&network=solana";
  const response = await httpGet(apiURL);

  const startOfDayUTC = getTimestampAtStartOfDayUTC(timestamp);

  const result = response?.data?.find((item) => item.timestamp === startOfDayUTC.toString());

  return {
    timestamp: timestamp,
    dailyVolume: result ? Number(result.volume_usd) / 1e18 : 0,
  }
}

const volume = Object.keys(endpoints).reduce(
  (acc, chain) => ({
    ...acc,
    [chain]: {
      fetch: fetchVolume,
      start: startTime[chain],
    },
  }),
  {}
);

volume[CHAIN.SOLANA] = {
  fetch: fetchSolanaVolume,
  start: startTime[CHAIN.SOLANA],
}

const adapter: SimpleAdapter = {
  version: 1,
  adapter: volume,
};
export default adapter;
