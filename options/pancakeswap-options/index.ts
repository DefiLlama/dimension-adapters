import request, { gql } from "graphql-request";
import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";

const url: { [s: string]: string } = {
  [CHAIN.ARBITRUM]: "https://api.0xgraph.xyz/api/public/e2146f32-5728-4755-b1d1-84d17708c119/subgraphs/dopex-v2-clamm-public/-/gn"
}

const query = gql`
  query getVolume($startTimestamp: BigInt!, $endTimestamp: BigInt!) {
    optionMarketDailyStats(where: { startTimestamp_gte: $startTimestamp, startTimestamp_lte: $endTimestamp }) {
      startTimestamp
      volume
      premium
      fees
    }
  }
`
interface IData {
  optionMarketDailyStats:Array<{
    startTimestamp: number;
    volume: string;
    premium: string;
    fees: string;
  }>
}
const fetchOptions = async (fetchOptions: FetchOptions): Promise<any> => {
  const today = fetchOptions.startOfDay;
  const end = today + 86400;
  const data: IData = await request(url[fetchOptions.chain], query, { startTimestamp: today, endTimestamp: end });
  const daily_premium = data.optionMarketDailyStats.reduce((acc, { premium }) => acc + Number(premium), 0);
  const daily_volume = data.optionMarketDailyStats.reduce((acc, { volume }) => acc + Number(volume), 0);
  return {
    dailyNotionalVolume: daily_volume,
    dailyPremiumVolume: daily_premium,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetchOptions,
      start: '2023-11-11',
    },
  }
}

export default adapter;
