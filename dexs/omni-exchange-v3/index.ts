import { request, gql } from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const v3_SUBGRAPHS: Record<string, { graph: string, start: string }> = {
  [CHAIN.BASE]: {
    graph: "https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/omni-v3-base/prod/gn",
    start: '2023-01-01'
  },
  [CHAIN.ARBITRUM]: {
    graph: "https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/omni-v3-arbitrum/prod/gn",
    start: '2023-01-01'
  },
  [CHAIN.OPTIMISM]: {
    graph: "https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/omni-v3-optimism/prod/gn",
    start: '2023-01-01'
  },
  [CHAIN.AVAX]: {
    graph: "https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/omni-v3-avalanche/prod/gn",
    start: '2023-01-01'
  },
  [CHAIN.SONIC]: {
    graph: "https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/omni-v3-sonic/prod/gn",
    start: '2023-01-01'
  },
  [CHAIN.BSC]: {
    graph: "https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/omni-v3-bsc/prod/gn",
    start: '2023-01-01'
  }
}

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

// Create fetch function for a specific chain
const fetch = async (_a:any, _b:any, options: FetchOptions) => {
  const chain = options.chain;
  const startTimestamp = options.startTimestamp;
  const dateId = Math.floor(startTimestamp / 86400);

  const data = await request(v3_SUBGRAPHS[chain].graph, V3_CLAMM_BIN_QUERY, { id: dateId.toString() });
  const volume = parseFloat(data.protocolDayData.volumeUSD || 0);
  const fees = parseFloat(data.protocolDayData.feesUSD || 0);    

  return {
    dailyVolume: volume,
    dailyFees: fees,
    dailyUserFees: fees,
  };
}

const methodology = {
  Fees: "swap fees paid by users.",
  UserFees: "swap fees paid by users.",
  Revenue: "",
  ProtocolRevenue: "",
  HoldersRevenue: "",
}

const adapter: SimpleAdapter = {
  fetch,
  adapter: v3_SUBGRAPHS,
  methodology,
};

export default adapter;
