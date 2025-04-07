import { GraphQLClient, gql } from "graphql-request";
import BigNumber from "bignumber.js";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

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

const queryVolumes = gql`
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

const fetch = async (timestamp: number, chain: string) => {
  const client = new GraphQLClient(endpoints[chain]);
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));

  const res = await client.request(queryVolumes, {
    startDate: timestamp - 86400,
    endDate: timestamp,
  });

  const volumeList = res.volumes as VolumeData[];

  const decimals = "1000000000000000000"; // 10**18

  const dailyVolume = volumeList.reduce((acc, item) => {
    return new BigNumber(item.volume).div(decimals).toNumber() + acc;
  }, 0);

  return {
    dailyVolume,
    timestamp: dayTimestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: (timeStamp: number) => {
        return fetch(timeStamp, CHAIN.ARBITRUM);
      },
      start: "2025-04-12",
    },
    [CHAIN.BASE]: {
      fetch: (timeStamp: number) => {
        return fetch(timeStamp, CHAIN.BASE);
      },
      start: "2025-04-12",
    },
  },
};

export default adapter;
