import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { GraphQLClient } from "graphql-request";


const fetch = async (_: number, _1: any, { startOfDay }: FetchOptions) => {
  const graphQLClient = new GraphQLClient("https://api.studio.thegraph.com/query/109849/rabbit-dex/version/latest")
  const res = await graphQLClient.request(`
        query RabbitSwapDailyVol($dateTimestamp: Int) {
          daily: uniDayDatas(where: { timestamp: $dateTimestamp }) {
            volumeUSD
            feesUSD
          }
        }`, { dateTimestamp: startOfDay })

  const dailyVolume = res.daily[0].volumeUSD;
  const dailyFees = res.daily[0].feesUSD;

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.TOMOCHAIN]: {
      fetch,
      start: "2024-11-12",
    },
  },
  methodology: {
    Volume:
      "USD Volume of RabbitSwap V3 using datasource from The Graph.",
    Fees: "USD Fees of RabbitSwap V3 using datasource from The Graph.",
  },
};

export default adapter;
