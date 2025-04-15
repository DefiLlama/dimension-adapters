import { GraphQLClient, } from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

interface VolumeData {
  volume: string;
  totalVolume: string;
  date: string;
}

const endpoints = {
  [CHAIN.ARBITRUM]:
    "https://subgraph.satsuma-prod.com/216876ddeec8/0xyzs-team--959441/elfi_arbitrum/api",
  [CHAIN.BASE]:
    "https://subgraph.satsuma-prod.com/216876ddeec8/0xyzs-team--959441/elfi_stats_base/api",
};

const queryVolumes = `
  query volumes($startDate: BigInt!, $endDate: BigInt!) {
    volumes(
      where: { date_gte: $startDate, date_lt: $endDate }
      orderBy: "date"
      orderDirection: "desc"
    ) {
      volume
      date
    }
  }
`;

const fetch = async (_: any, _1: any, { fromTimestamp, toTimestamp, chain, }: FetchOptions) => {
  const client = new GraphQLClient(endpoints[chain]);

  const res = await client.request(queryVolumes, {
    startDate: fromTimestamp,
    endDate: toTimestamp,
  });

  const volumeList = res.volumes as VolumeData[];
  const dailyVolume = volumeList.reduce((acc, item: any) => item.volume / 1e18 + acc, 0);

  return {
    dailyVolume,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch, start: "2025-04-12",
    },
    [CHAIN.BASE]: {
      fetch, start: "2025-04-12",
    },
  },
};

export default adapter;
