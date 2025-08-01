import { gql, request } from "graphql-request";
import { FetchOptions, } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

interface Trade {
  notionalUp: string;
  notionalDown: string;
  premium: string;
}

const SUBGRAPH_URL = "https://api.studio.thegraph.com/proxy/64770/smilee-finance/version/latest";

const tradeQuery = gql`
    query trades($timestampFrom: Int!, $timestampTo: Int!) {
        trades(where: {timestamp_gt: $timestampFrom, timestamp_lte: $timestampTo}) {
            notionalUp
            notionalDown
            premium
        }
    }`;

const fetch: any = async ({ fromTimestamp, toTimestamp, createBalances }: FetchOptions) => {

  const dailyNotionalVolume = createBalances();
  const dailyPremiumVolume = createBalances();

  // Fetching daily trades
  const tradeResponse = await request(SUBGRAPH_URL, tradeQuery, {
    timestampFrom: fromTimestamp,
    timestampTo: toTimestamp,
  }) as { trades: Trade[] };

  tradeResponse.trades
    .filter((i) => Number(i.notionalUp) / 1e6 < 10_000_000)
    .filter((i) => Number(i.notionalDown) / 1e6 < 10_000_000)
    .filter((i) => Number(i.premium) / 1e6 < 10_000_000)
    .forEach((trade: Trade) => {
      dailyNotionalVolume.addUSDValue((Number(trade.notionalUp) + Number(trade.notionalDown)) / 1e6);
      dailyPremiumVolume.addUSDValue(Number(trade.premium) / 1e6);
    });

  return { dailyNotionalVolume, dailyPremiumVolume };
};

const adapter = {
  version: 2,
  deadFrom: '2024-09-15',
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch,
      start: '2024-03-14'
    },
  }
};

export default adapter;
