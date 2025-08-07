import { request, gql } from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// // Organized subgraph endpoints
// const SUBGRAPHS: Record<string, Record<string, string>> = {
//   [CHAIN.BASE]: {
//     v2: "https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/omni-v2-base/prod/gn",
//     v3: "https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/omni-v3-base/prod/gn",
//     clamm: "https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/omni-clamm-base/prod/gn",
//     bin: "https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/omni-bin-base/prod/gn"
//   },
//   [CHAIN.ARBITRUM]: {
//     v2: "https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/omni-v2-arbitrum/prod/gn",
//     v3: "https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/omni-v3-arbitrum/prod/gn",
//     clamm: "https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/omni-clamm-arbitrum/prod/gn",
//     bin: "https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/omni-bin-arbitrum/prod/gn"
//   },
//   [CHAIN.OPTIMISM]: {
//     v2: "https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/omni-v2-optimism/prod/gn",
//     v3: "https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/omni-v3-optimism/prod/gn",
//     clamm: "https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/omni-clamm-optimism/prod/gn",
//     bin: "https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/omni-bin-optimism/prod/gn"
//   },
//   [CHAIN.AVAX]: {
//     v2: "https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/omni-v2-avalanche/prod/gn",
//     v3: "https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/omni-v3-avalanche/prod/gn",
//     clamm: "https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/omni-clamm-avalanche/prod/gn",
//     bin: "https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/omni-bin-avalanche/prod/gn"
//   },
//   [CHAIN.SONIC]: {
//     v2: "https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/omni-v2-sonic/prod/gn",
//     v3: "https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/omni-v3-sonic/prod/gn",
//     clamm: "https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/omni-clamm-sonic/prod/gn",
//     bin: "https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/omni-bin-sonic/prod/gn"
//   },
//   [CHAIN.BSC]: {
//     v2: "https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/omni-v2-bsc/prod/gn",
//     v3: "https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/omni-v3-bsc/prod/gn",
//     clamm: "https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/omni-clamm-bsc/prod/gn",
//     bin: "https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/omni-bin-bsc/prod/gn"
//   }
// };

const flux_SUBGRAPHS: Record<string, { graph: string, start: string }> = {
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
  [CHAIN.SONIC]: {
    graph: "https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/omni-v2-sonic/prod/gn",
    start: '2023-01-01'
  },
  [CHAIN.BSC]: {
    graph: "https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/omni-v2-bsc/prod/gn",
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

  const data = await request(flux_SUBGRAPHS[chain].graph, V3_CLAMM_BIN_QUERY, { id: dateId.toString() });
  const volume = parseFloat(data.protocolDayData?.volumeUSD || 0);
  const fees = parseFloat(data.protocolDayData?.feesUSD || 0);    

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
  adapter: flux_SUBGRAPHS,
  methodology,
};

export default adapter;
