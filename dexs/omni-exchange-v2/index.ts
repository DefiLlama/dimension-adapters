import { request, gql } from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const v2_SUBGRAPHS: Record<string, { graph: string, start: string }> = {
  [CHAIN.BASE]: {
    graph: "https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/omni-v2-base/prod/gn",
    start: '2023-01-01'
  },
  [CHAIN.ARBITRUM]: {
    graph: "https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/omni-v2-arbitrum/prod/gn",
    start: '2023-01-01'
  },
  [CHAIN.OPTIMISM]: {
    graph: "https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/omni-v2-optimism/prod/gn",
    start: '2023-01-01'
  },
  [CHAIN.AVAX]: {
    graph: "https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/omni-v2-avalanche/prod/gn",
    start: '2023-01-01'
  },
  // [CHAIN.SONIC]: {
  //   graph: "https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/omni-v2-sonic/prod/gn",
  //   start: '2023-01-01'
  // },
  [CHAIN.PLASMA]: {
    graph: "https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/omni-v2-plasma/prod/gn",
    start: '2023-01-01'
  },
  [CHAIN.BSC]: {
    graph: "https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/omni-v2-bsc/prod/gn",
    start: '2023-01-01'
  }
}

// Different queries for different pool types
const V2_QUERY = gql`
  query getV2Volume($id: String!) {
    protocolDayData(id: $id) {
      id
      date
      dailyVolumeUSD
    }
  }
`;

const V3_CLAMM_BIN_QUERY = gql`
  query getVolume($id: String!) {
    protocolDayData(id: $id) {
      id
      date
      volumeUSD
      feesUSD
    }
  }
`;

const fetch = async (_a:any, _b:any, options: FetchOptions) => {
  const chain = options.chain;
  const startTimestamp = options.startTimestamp;
  const dateId = Math.floor(startTimestamp / 86400);

  const data = await request(v2_SUBGRAPHS[chain].graph, V2_QUERY, { id: dateId.toString() });

  const volume = parseFloat(data.protocolDayData?.dailyVolumeUSD || 0);
  const fees = volume * 0.003; // 0.3% fee

  return {
    dailyVolume: volume,
    dailyFees: fees,
    dailyUserFees: fees,
    dailyRevenue: '0',
    dailyProtocolRevenue: '0',
    dailyHoldersRevenue: '0',
    dailySupplySideRevenue: fees,
  };
}

const methodology = {
  Fees: "swap fees paid by users.",
  UserFees: "swap fees paid by users.",
  Revenue: "protocol revenue is zero",
  ProtocolRevenue: "protocol revenue is zero",
  HoldersRevenue: "holders revenue is zero",
  SupplySideRevenue: "100% revenue goes to the liquidity providers",
}

const adapter: SimpleAdapter = {
  fetch,
  adapter: v2_SUBGRAPHS,
  methodology,
};

export default adapter;
