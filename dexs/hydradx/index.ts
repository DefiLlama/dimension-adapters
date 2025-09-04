import fetchURL from "../../utils/fetchURL"
import type { SimpleAdapter } from "../../adapters/types";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";
import { request } from "graphql-request";

const URL = "https://api.hydradx.io/defillama/v1/volume"

type IAPIResponse = {
  volume_usd: number;
}[];

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const response: IAPIResponse = (await fetchURL(URL));
  const dailyVolume = response[0].volume_usd;

  // Fetch fees data from GraphQL endpoint
  let dailyFees = 0;
  try {
    const feesQuery = `
      query MyQuery {
        platformTotalVolumesByPeriod(filter: {period: _24H_}) {
          nodes {
            omnipoolFeeVolNorm
            stableswapFeeVolNorm
            xykpoolFeeVolNorm
          }
        }
      }
    `;

    const feesResponse = await request("https://galacticcouncil.squids.live/hydration-pools:whale-prod/api/graphql", feesQuery);
    
    if (feesResponse.platformTotalVolumesByPeriod?.nodes?.length > 0) {
      const node = feesResponse.platformTotalVolumesByPeriod.nodes[0];
      
      // Sum all fee volumes to get total USD fees
      dailyFees = (
        parseFloat(node.omnipoolFeeVolNorm || '0') +
        parseFloat(node.stableswapFeeVolNorm || '0') +
        parseFloat(node.xykpoolFeeVolNorm || '0')
      );
    }
  } catch (error) {
    console.error("Error fetching HydraDX fees:", error);
    // Continue with dailyFees = 0 if API fails
  }

  return {
    dailyVolume: dailyVolume,
    dailyFees: dailyFees,
    dailyRevenue: dailyFees / 10,
    timestamp: dayTimestamp,
  };
};

const methodology = {
  Fees: 'All fees paid by users for swaps on Hydration.',
  Revenue: 'Approx 1/10th of fees is distributed to the protocol treasury',
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.HYDRADX]: {
      fetch,
      runAtCurrTime: true,
      start: '2023-08-22',
    },
  },
  methodology,
};

export default adapter;
