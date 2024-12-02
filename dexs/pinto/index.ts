import { request, gql } from "graphql-request";
import { FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

class SubgraphVolumeResponse {
  wells: SubgraphWell[];
}

class SubgraphWell {
  rollingDailyTradeVolumeUSD: string;
  cumulativeTradeVolumeUSD: string;
}

const START_TIME = 1732035279;
const SUBGRAPH = "https://graph.pinto.money/exchange";

const methodology = {
  dailyVolume: "USD sum of all swaps and add/remove liquidity operations that affect the price of pooled tokens.",
  UserFees: "There are no user fees.",
  SupplySideRevenue: "There is no swap revenue for LP holders. Deposit rewards can be earned by depositing LP tokens in the Pinto Silo.",
  Fees: "There are no fees."
};

/**
 * Returns daily/cumulative volume for the requested wells.
 * @param block - the block in which to query the subgraph.
 */
async function getVolumeStats(block: number): Promise<FetchResultV2> {

  // Gets the volume of each well from the subgraph.
  const subgraphVolume = await request(SUBGRAPH, gql`
    {
      wells(
        block: {number: ${block}}
        first: 1000
        orderBy: cumulativeTradeVolumeUSD
        orderDirection: desc
      ) {
        rollingDailyTradeVolumeUSD
        cumulativeTradeVolumeUSD
      }
    }`
  ) as SubgraphVolumeResponse;

  // Sum and return the overall volume
  return subgraphVolume.wells.reduce((result: FetchResultV2, next: SubgraphWell) => {
    return {
      dailyVolume: result.dailyVolume as number + parseFloat(next.rollingDailyTradeVolumeUSD),
      totalVolume: result.totalVolume as number + parseFloat(next.cumulativeTradeVolumeUSD)
    };
  }, { dailyVolume: 0, totalVolume: 0 });
}

export default {
  version: 2,
  adapter: {
    [CHAIN.BASE]: {
      fetch: async (fetchParams: FetchOptions): Promise<FetchResultV2> => {
        const block = await fetchParams.getEndBlock();
        return await getVolumeStats(block);
      },
      start: async () => START_TIME,
      runAtCurrTime: false, // Backfill is allowed
      meta: {
        methodology
      }
    }
  }
};
