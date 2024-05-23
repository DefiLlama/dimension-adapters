import { Chain } from "@defillama/sdk/build/general";
import { CHAIN } from "../helpers/chains";
import { type } from "os";
import request, { gql } from "graphql-request";
import { Fetch, FetchResultFees, SimpleAdapter } from "../adapters/types";
import { getBlock } from "../helpers/getBlock";

type TEndpoint = {
  [key in Chain]: string
}

const endpoints: TEndpoint = {
  [CHAIN.ETHEREUM]: "https://api.thegraph.com/subgraphs/name/edoapp/clipper-mainnet",
  [CHAIN.OPTIMISM]: "https://api.thegraph.com/subgraphs/name/edoapp/clipper-optimism",
  [CHAIN.POLYGON]: "https://api.thegraph.com/subgraphs/name/edoapp/clipper-polygon",
  // [CHAIN.MOONBEAN]: "https://api.thegraph.com/subgraphs/name/edoapp/clipper-moonbeam",
  [CHAIN.ARBITRUM]: "https://api.thegraph.com/subgraphs/name/edoapp/clipper-arbitrum",
};

interface IPool {
  id: string
  revenueUSD: string
  feeUSD: string
}
interface IDailyPoolStatus {
  revenueUSD: string
  feeUSD: string
  from: string
  to: string
}
interface IResponse {
  pools: IPool[]
  dailyPoolStatuses: IDailyPoolStatus[]
}
const feesQuery = gql`
  query fees($fromTimestamp: Int!, $toTimestamp: Int!, $blockNumber: Int!) {
    pools(first: 5, block: {number: $blockNumber}) {
      id
      revenueUSD,
      feeUSD
    }
    dailyPoolStatuses(orderBy: feeUSD, orderDirection: desc, where: {from_gte: $fromTimestamp, from_lte: $toTimestamp}) {
      revenueUSD,
      feeUSD,
      from,
      to
    }
  }
`

const fetchFees = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultFees> => {
    const endpoint = endpoints[chain];
    const toTimestamp = timestamp;
    const fromTimestamp = timestamp - 60 * 60 * 24;
    const toBlock = await getBlock(timestamp, chain, {});

    const response: IResponse = (await request(endpoint, feesQuery, {
      fromTimestamp,
      toTimestamp,
      blockNumber: toBlock
    }));

    const dailyFees = response.dailyPoolStatuses.reduce((acc, pool) => {
      return acc + Number(pool.feeUSD);
    }, 0);
    const dailyRevenue = response.dailyPoolStatuses.reduce((acc, pool) => {
      return acc + Number(pool.revenueUSD);
    },0);
    const totalFees = response.pools.reduce((acc, pool) => {
      return acc + Number(pool.feeUSD);
    },0);
    const totalRevenue = response.pools.reduce((acc, pool) => {
      return acc + Number(pool.revenueUSD);
    },0);

    return {
      dailyFees: `${dailyFees}`,
      dailyRevenue: `${dailyRevenue}`,
      dailyProtocolRevenue: `${dailyRevenue}`,
      totalFees: `${totalFees}`,
      totalRevenue: `${totalRevenue}`,
      totalProtocolRevenue: `${totalRevenue}`,
      timestamp
    }
  }
}

const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetchFees(CHAIN.ETHEREUM),
      start: 1659657600,
    },
    [CHAIN.OPTIMISM]: {
      fetch: fetchFees(CHAIN.OPTIMISM),
      start: 1656460800,
    },
    [CHAIN.POLYGON]: {
      fetch: fetchFees(CHAIN.POLYGON),
      start: 1650412800,
    },
    // [CHAIN.MOONBEAM]: {
    //   fetch: fetchFees(CHAIN.MOONBEAN),
    //   start: 1659657600,
    // },
    [CHAIN.ARBITRUM]: {
      fetch: fetchFees(CHAIN.ARBITRUM),
      start: 1690934400,
    }
  }
}

export default adapters;
