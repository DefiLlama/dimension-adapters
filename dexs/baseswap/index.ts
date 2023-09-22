import customBackfill from "../../helpers/customBackfill";
import { DEFAULT_TOTAL_VOLUME_FACTORY, DEFAULT_TOTAL_VOLUME_FIELD, DEFAULT_DAILY_VOLUME_FACTORY, DEFAULT_DAILY_VOLUME_FIELD } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";
import type { BreakdownAdapter, ChainEndpoints, SimpleAdapter } from "../../adapters/types";
import type { Chain } from "@defillama/sdk/build/general";
import { getGraphDimensions } from "../../helpers/getUniSubgraph";
import { handle200Errors } from "../../helpers/getUniSubgraph/utils";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";
import { gql, request } from "graphql-request";
import { getPrices } from "../../utils/prices";

// Subgraphs endpoints
const v2Endpoints: ChainEndpoints = {
  [CHAIN.BASE]: "https://api.thegraph.com/subgraphs/name/harleen-m/baseswap",
};

const derivativesEndpoints: ChainEndpoints = {
  [CHAIN.BASE]: "https://base.tempsubgraph.xyz/subgraphs/name/unidex-finance/baseleveragev2",
};

// Tokens
type TDerivativesTokenIds = {
  [chains: string]: string[],
};

const derivativesTokenIds:TDerivativesTokenIds = {
  [CHAIN.BASE]: ["0x78a087d713be963bf307b18f2ff8122ef9a63ae9"], // BSWAP
};

// Fetch function to query the subgraphs
const v2Graph = getGraphDimensions({
  graphUrls: v2Endpoints,
  totalVolume: {
    factory: DEFAULT_TOTAL_VOLUME_FACTORY,
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
  dailyVolume: {
    factory: DEFAULT_DAILY_VOLUME_FACTORY,
    field: DEFAULT_DAILY_VOLUME_FIELD,
  },
  feesPercent: {
    type: "volume",
    UserFees: 0.25,
    SupplySideRevenue: 0.17,
    ProtocolRevenue: 0.08,
    Revenue: 0.25,
    Fees: 0.25,
  }
});

const derivativesGraph = (chain: Chain) => {
  return async (timestamp: number) => {
    const dayTimestamp = getTimestampAtStartOfDayUTC(timestamp);

    const totalVolumeQuery = gql`
      query total_volume($tokens: [String]) {
        datas (where: { id_in: $tokens }) {
          id
          cumulativeFees
          cumulativeVolume
        }
      }
    `;

    const dailyVolumeQuery = gql`
      query daily_volume($date: Int) {
        dayDatas (where: { date: $date }) {
          id
          cumulativeFees
          cumulativeVolume
        }
      }
    `;

    const tokens = derivativesTokenIds[chain];
    const prices = await getPrices(derivativesTokenIds[chain].map(e => chain + ":" + e), timestamp);

    const graphResTotalVolume = await request(derivativesEndpoints[chain], totalVolumeQuery, { tokens }).catch(handle200Errors).catch(e => console.error(`Failed to get total volume on ${chain} with graph ${derivativesEndpoints[chain]}: ${e.message}`));
    const totalVolume = graphResTotalVolume['datas'].reduce((acc: number, e: any) => acc + Number(e.cumulativeVolume * prices[chain + ":" + e.id].price), 0) / 1e8;
    const totalFees = graphResTotalVolume['datas'].reduce((acc: number, e: any) => acc + Number(e.cumulativeFees * prices[chain + ":" + e.id].price), 0) / 1e8;

    const graphResDailyVolume = await request(derivativesEndpoints[chain], dailyVolumeQuery, { date: dayTimestamp }).catch(handle200Errors).catch(e => console.error(`Failed to get daily volume on ${chain} with graph ${derivativesEndpoints[chain]}: ${e.message}`));
    const dailyVolume = graphResDailyVolume['dayDatas'].filter((e: any) => tokens.includes(e.id.split("-")[0])).reduce((acc: number, e: any) => acc + Number(e.cumulativeVolume * prices[chain + ":" + e.id.split("-")[0]].price), 0) / 1e8;
    const dailyFees = graphResDailyVolume['dayDatas'].filter((e: any) => tokens.includes(e.id.split("-")[0])).reduce((acc: number, e: any) => acc + Number(e.cumulativeFees * prices[chain + ":" + e.id.split("-")[0]].price), 0) / 1e8;

    return {
      timestamp: timestamp,
      totalVolume: totalVolume,
      totalFees: totalFees,
      totalUserFees: totalFees,
      totalRevenue: totalFees * 0.2,
      // totalProtocolRevenue: totalFees * 0.2,
      totalSupplySideRevenue: totalFees * 0.3,
      dailyVolume: dailyVolume,
      dailyFees: dailyFees,
      dailyUserFees: dailyFees,
      dailyRevenue: dailyFees * 0.2,
      // dailyProtocolRevenue: dailyFees * 0.2,
      dailySupplySideRevenue: dailyFees * 0.3,
    }
  }
};

const v2Methodology = {
  UserFees: "User pays 0.25% fees on each swap.",
  SupplySideRevenue: "LPs receive 0.17% of each swap.",
  ProtocolRevenue: "Treasury receives 0.08% of each swap.",
  Revenue: "All revenue generated comes from user fees.",
  Fees: "All fees come from the user.",
};

const derivativesMethodology = {
  UserFees: "User pays fees on opening/closing positions and hourly borrow fees.",
  SupplySideRevenue: "LPs receive 30% of all fees.",
  // ProtocolRevenue: "Treasury receives 20% of all fees.",
  Revenue: "All revenue generated comes from 20% of all fees.",
  Fees: "All fees come from the user.",
};

const adapter: BreakdownAdapter = {
  breakdown: {
    swap: Object.keys(v2Endpoints).reduce((acc, chain) => {
      return {
        ...acc,
        [chain]: {
          fetch: v2Graph(chain as Chain),
          start: async () => 1690495200,
          customBackfill: customBackfill(chain, v2Graph),
          meta: { methodology: v2Methodology },
        }
      }
    }, {}),
    derivatives: Object.keys(derivativesEndpoints).reduce((acc, chain) => {
      return {
        ...acc,
        [chain]: {
          fetch: derivativesGraph(chain as Chain),
          start: async () => 1693353600,
          customBackfill: customBackfill(chain, derivativesGraph),
          meta: { methodology: derivativesMethodology },
        }
      }
    }, {}),
  }
};

export default adapter;
