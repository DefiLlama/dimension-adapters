import * as sdk from "@defillama/sdk";
import request, { gql } from "graphql-request";
import { FetchResultGeneric, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
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

const thegraph_endpoints = sdk.graph.modifyEndpoint('4z9FBF12CrfoQJhAkWicqzY2fKYN9QRmuzSsizVXhjKa');
const radix_endpoint = "https://radix.defiplaza.net/api/defillama/volume";

const adapter: SimpleAdapter = {

  methodology: {
    Fees: "User pays 0.5% of each swap, double if hopping between pairs is needed.",
    Revenue: "Protocol takes 5ct USD per swap, double if hopping between pairs is needed.",
    SupplySideRevenue: "LPs revenue is 0.5% of each swap, double if hopping between pairs is needed.",
  },
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
}`));
        const dailySupplySideRevenue = graphData.dailies[0].feesUSD;
        const dailyFees = dailySupplySideRevenue;
        const dailyUserFees = dailyFees;

        return {
          dailyVolume: graphData.dailies[0].tradeVolumeUSD,

          dailyFees,
          dailyUserFees,
          dailySupplySideRevenue
        }
      },
      start: '2021-10-03'
    },
    [CHAIN.RADIXDLT]: {
      fetch: async (timestamp: number): Promise<FetchResultGeneric> => {
        const daily: RadixPlazaResponse = (await fetchURL(radix_endpoint + `?timestamp=${timestamp}`));

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
        }
      },
      start: '2023-11-24'
    }
  },
};

export default adapter;
