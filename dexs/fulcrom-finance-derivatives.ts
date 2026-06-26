import request, { gql } from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const chainConfig: Record<string, { endpoint: string; start: string }> = {
  [CHAIN.CRONOS]: {
    endpoint: "https://graph.cronoslabs.com/subgraphs/name/fulcrom/stats-prod",
    start: '2023-02-27',
  },
  [CHAIN.CRONOS_ZKEVM]: {
    endpoint: "https://api.goldsky.com/api/public/project_clwrfupe2elf301wlhnd7bvva/subgraphs/fulcrom-stats-mainnet/prod/gn",
    start: '2024-08-15',
  },
};
const toUSD = (value: string | bigint) => Number(BigInt(value) / 10n ** 24n) / 1e6;

const query = gql`
  query get_volume($id: String!, $timestamp: Int!) {
    volumeStats(where: { period: "daily", id: $id }) {
      liquidation
      margin
    }
    tradingStats(first: 1, where: { period: daily, timestamp_lte: $timestamp }, orderBy: timestamp, orderDirection: desc) {
      longOpenInterest
      shortOpenInterest
    }
  }
`;

interface IGraphResponse {
  volumeStats: Array<{
    liquidation: string;
    margin: string;
  }>;
  tradingStats: Array<{
    longOpenInterest: string;
    shortOpenInterest: string;
  }>;
}

const fetch = async (options: FetchOptions) => {
  const dailyData: IGraphResponse = await request(chainConfig[options.chain].endpoint, query, {
    id: "daily:" + String(options.startOfDay),
    timestamp: options.startOfDay,
  });
  const volume = dailyData.volumeStats[0];
  const oi = dailyData.tradingStats[0];

  const dailyVolume = toUSD(BigInt(volume.margin) + BigInt(volume.liquidation));
  const longOpenInterestAtEnd = toUSD(oi.longOpenInterest);
  const shortOpenInterestAtEnd = toUSD(oi.shortOpenInterest);
  const openInterestAtEnd = longOpenInterestAtEnd + shortOpenInterestAtEnd;

  return {
    dailyVolume,
    openInterestAtEnd,
    longOpenInterestAtEnd,
    shortOpenInterestAtEnd,
  };
};

const adapter: SimpleAdapter = {
  fetch,
  adapter: chainConfig,
};

export default adapter;
