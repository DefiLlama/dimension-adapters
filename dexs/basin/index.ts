import { request, gql } from "graphql-request";
import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

class SubgraphVolumeResponse {
  wells: SubgraphWell[];
}

class SubgraphWell {
  rollingDailyTradeVolumeUSD: string;
  cumulativeTradeVolumeUSD: string;
}

enum WellType {
  SPOT
};

const chains = {
  [CHAIN.ETHEREUM]: {
    startBlock: 17977905,
    startTime: 1692793703,
    subgraph: "https://graph.bean.money/basin_eth"
  },
  [CHAIN.ARBITRUM]: {
    startBlock: 261000000,
    startTime: 1728223509,
    subgraph: "https://graph.bean.money/basin"
  }
};

const methodology = {
  dailyVolume: "USD sum of all swaps and add/remove liquidity operations that affect the price of pooled tokens",
  UserFees: "There are no user fees.",
  SupplySideRevenue: "There is no swap revenue for LP holders. However, rewards can be received if whitelisted LP tokens are deposited in the Beanstalk Silo.",
  Fees: "There are no fees."
};

/**
 * Returns daily/cumulative volume for the requested wells.
 * @param chain - the chain for which to retrieve the statistics.
 * @param type - the type of Well for which to get the volume.
 * @param block - the block in which to query the subgraph.
 * @dev Currently only type=SPOT is supported, as this is the only type of market which has been deployed
 *  so far. Future work in this adapter includes updating the subgraph query to account for the well type.
 */
async function getVolumeStats(chain: CHAIN, type: WellType, block: number): Promise<FetchResultV2> {

  // Gets the volume of each well from the subgraph.
  // If there are more than 1,000 wells at some point in the future, this may need to be revisited.
  const subgraphVolume = await request(chains[chain].subgraph, gql`
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
    };
  }, { dailyVolume: 0 });
}

function volumeForCategory(chain: CHAIN, type: WellType) {

  return {
    fetch: async (fetchParams: FetchOptions): Promise<FetchResultV2> => {
      const block = await fetchParams.getEndBlock();
      return await getVolumeStats(chain, type, block);
    },
    start: chains[chain].startTime,
  }
}

// Currently there are only spot wells available, but it is expeted for more to exist in the future,
// therefore using BreakdownAdapter.
const adapter: SimpleAdapter = {
  methodology,
  version: 2,
  adapter: Object.keys(chains).reduce((acc, chain) => {
    acc[chain] = volumeForCategory(chain as CHAIN, WellType.SPOT);
    return acc;
  }, {})
};

export default adapter;
