import request, { gql } from "graphql-request";
import { FetchResultGeneric, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getChainVolume } from "../../helpers/getUniSubgraphVolume";
import fetchURL from "../../utils/fetchURL";

type RadixPlazaResponse = {
  date: number,
  stateVersion: number,
  totalValueLockedUSD: number,
  volumeUSD: number,
  feesUSD: number,
  royaltiesUSD: number,
  swaps: number
}

const thegraph_endpoints = "https://api.thegraph.com/subgraphs/name/omegasyndicate/defiplaza";
const radix_endpoint = "https://radix.defiplaza.net/api/defillama/volume";

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: async (timestamp: number): Promise<FetchResultGeneric> => {
        const graphData = (await request(thegraph_endpoints, gql`
{
  factories(first: 1) {
    swapCount
    totalTradeVolumeUSD
    totalFeesEarnedUSD
  }
  dailies(first: 1, where:{date_lte: ${timestamp}}, orderBy: date, orderDirection:desc) {
    date
    tradeVolumeUSD
    swapUSD
    feesUSD
  }
}`)).data;

        const dailySupplySideRevenue = graphData.dailies[0].feesUSD;
        const dailyFees = dailySupplySideRevenue;
        const dailyUserFees = dailyFees;

        return {
          totalVolume: graphData.factories.totalTradeVolumeUSD,
          dailyVolume: graphData.dailies[0].tradeVolumeUSD,

          totalFees: graphData.factories.totalFeesEarnedUSD,
          dailyUserFees,
          dailyFees,
          dailySupplySideRevenue,
          timestamp
        }
      },
      start: async () => 1633237008
    },
    [CHAIN.RADIXDLT]: {
      fetch: async (timestamp: number): Promise<FetchResultGeneric> => {
        const daily: RadixPlazaResponse = (await fetchURL(radix_endpoint + `?timestamp=${timestamp}`)).data;

        const dailySupplySideRevenue = daily.feesUSD;
        const dailyProtocolRevenue = daily.royaltiesUSD;
        const dailyRevenue = dailyProtocolRevenue;
        const dailyFees = dailySupplySideRevenue + dailyRevenue;
        const dailyUserFees = dailyFees;

        return {
          dailyVolume: daily.volumeUSD,
          dailyUserFees,
          dailyFees,
          dailyRevenue,
          dailyProtocolRevenue,
          dailySupplySideRevenue,
          timestamp
        }
      },
      meta: {
        methodology: {
          Fees: "User pays 0.5% of each swap, double if hopping between pairs is needed.",
          Revenue: "Protocol takes 5ct USD per swap, double if hopping between pairs is needed.",
          SupplySideRevenue: "LPs revenue is 0.5% of each swap, double if hopping between pairs is needed.",
        }
      },
      start: async () => 1700784000,
      // runAtCurrTime: true
    }
  },
};

export default adapter;
