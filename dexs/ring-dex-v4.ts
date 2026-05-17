import request, { gql } from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const chainConfig: any = {
  [CHAIN.ETHEREUM]: {
    endpoint: "https://api-explore-ring-production.up.railway.app",
    start: "2025-02-01",
  },
};

const dayDataQuery = gql`
  query ringV4PoolDayDatas($date: BigInt!, $limit: Int!, $offset: Int!) {
    v4PoolDayDatas(limit: $limit, offset: $offset, where: { date: $date }) {
      totalCount
      items {
        poolId
        volumeUSD
        untrackedVolumeUSD
        feesUSD
        pool {
          feeTier
        }
      }
    }
  }
`;

async function fetch(_: number, _1: any, options: FetchOptions) {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const { endpoint } = chainConfig[options.chain];
  const limit = 100;

  for (let offset = 0; ; offset += limit) {
    const res: any = await request(endpoint, dayDataQuery, {
      date: String(options.startOfDay),
      limit,
      offset,
    });

    const items = res.v4PoolDayDatas.items;
    items.forEach((item: any) => {
      const itemVolume = Number(item.volumeUSD || 0) || Number(item.untrackedVolumeUSD || 0);
      const itemFees = Number(item.feesUSD || 0) || itemVolume * Number(item.pool?.feeTier || 0) / 1e6;

      if (itemVolume) dailyVolume.addUSDValue(itemVolume);
      if (itemFees) dailyFees.addUSDValue(itemFees);
    });

    if (offset + items.length >= res.v4PoolDayDatas.totalCount || items.length < limit) break;
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue : 0,
    dailySupplySideRevenue: dailyFees,
  };
}

const adapter: SimpleAdapter = {
  version: 1,
  methodology: {
    Volume: "Volume is taken from Ring's v4 pool data.",
    Fees: "Fees are taken from Ring's v4 pool data when available. Otherwise, they are estimated from the pool fee tier and daily volume.",
    UserFees: "Users pay swap fees on each trade.",
    Revenue: "Ring does not currently take protocol revenue from these v4 pools.",
    SupplySideRevenue: "All swap fees are treated as liquidity provider revenue.",
  },
  fetch,
  adapter: chainConfig,
};

export default adapter;
