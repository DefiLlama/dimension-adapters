import { request, gql } from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const flux_SUBGRAPHS: Record<string, { clamm_graph: string, bin_graph: string, start: string }> = {
  [CHAIN.BASE]: {
    clamm_graph: "https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/omni-clamm-base/prod/gn",
    bin_graph: "https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/omni-bin-base/prod/gn",
    start: '2023-01-01'
  },
  [CHAIN.ARBITRUM]: {
    clamm_graph: "https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/omni-clamm-arbitrum/prod/gn",
    bin_graph: "https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/omni-bin-arbitrum/prod/gn",
    start: '2023-01-01'
  },
  [CHAIN.OPTIMISM]: {
    clamm_graph: "https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/omni-clamm-optimism/prod/gn",
    bin_graph: "https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/omni-bin-optimism/prod/gn",
    start: '2023-01-01'
  },
  [CHAIN.AVAX]: {
    clamm_graph: "https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/omni-clamm-avalanche/prod/gn",
    bin_graph: "https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/omni-bin-avalanche/prod/gn",
    start: '2023-01-01'
  },
  [CHAIN.SONIC]: {
    clamm_graph: "https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/omni-clamm-sonic/prod/gn",
    bin_graph: "https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/omni-bin-sonic/prod/gn",
    start: '2023-01-01'
  },
  [CHAIN.BSC]: {
    clamm_graph: "https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/omni-clamm-bsc/prod/gn",
    bin_graph: "https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/omni-bin-bsc/prod/gn",
    start: '2023-01-01'
  }
}

const CLAMM_BIN_QUERY = gql`
  query getVolume($id: String!) {
    protocolDayData(id: $id) {
      id
      date
      volumeUSD
      feesUSD
      protocolFeesUSD
    }
  }
`;

const fetch = async (_a:any, _b:any, options: FetchOptions) => {
  const chain = options.chain;
  const startTimestamp = options.startTimestamp;
  const dateId = Math.floor(startTimestamp / 86400);

  const clamm_data = await request(flux_SUBGRAPHS[chain].clamm_graph, CLAMM_BIN_QUERY, { id: dateId.toString() });
  const bin_data = await request(flux_SUBGRAPHS[chain].bin_graph, CLAMM_BIN_QUERY, { id: dateId.toString() });

  const dailyVolume = parseFloat(clamm_data.protocolDayData?.volumeUSD || 0) + parseFloat(bin_data.protocolDayData?.volumeUSD || 0);
  const dailyFees = parseFloat(clamm_data.protocolDayData?.feesUSD || 0) + parseFloat(bin_data.protocolDayData?.feesUSD || 0);
  const dailyProtocolRevenue = parseFloat(clamm_data.protocolDayData?.protocolFeesUSD || 0) + parseFloat(bin_data.protocolDayData?.protocolFeesUSD || 0);
  const dailySupplySideRevenue = dailyFees - dailyProtocolRevenue;

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue: '0',
    dailySupplySideRevenue,
  };
}

const methodology = {
  Fees: "swap fees paid by users.",
  UserFees: "swap fees paid by users.",
  Revenue: "Protocol share from swap fees",
  ProtocolRevenue: "Protocol share from swap fees",
  HoldersRevenue: "No Holder Revenue",
  SupplySideRevenue: "Liquidity providers share fromswap fees",
}

const adapter: SimpleAdapter = {
  fetch,
  adapter: flux_SUBGRAPHS,
  methodology,
};

export default adapter;
