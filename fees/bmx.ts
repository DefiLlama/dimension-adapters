import { Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { request, gql } from "graphql-request";
import { getTimestampAtStartOfDayUTC } from "../utils/date";

const endpoints: { [key: string]: string } = {
  [CHAIN.BASE]:
    "https://api.thegraph.com/subgraphs/name/morphex-labs/bmx-base-stats",
};

const methodology = {
  Fees: "Fees from open/close position (0.1%), liquidations, swap (0.2% to 0.8%), mint and burn (based on tokens balance in the pool) and borrow fee ((assets borrowed)/(total assets in pool)*0.01%)",
  UserFees:
    "Fees from open/close position (0.1%), swap (0.2% to 0.8%) and borrow fee ((assets borrowed)/(total assets in pool)*0.01%)",
  HoldersRevenue: "10% of all collected fees are distributed to BMX stakers",
  SupplySideRevenue: "60% of all collected fees are distributed to BLT stakers",
  Revenue:
    "Revenue is 40% of all collected fees, which are distributed to BMX/wBLT LP stakers and BMX stakers",
};

const graphs = (chain: string) => async (timestamp: number) => {
  const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp);
  const searchTimestamp = todaysTimestamp + ":daily";

  const graphQuery = gql`{
        feeStat(id: "${searchTimestamp}") {
          mint
          burn
          marginAndLiquidation
          swap
        }
      }`;

  const graphRes = await request(endpoints[chain], graphQuery);

  const dailyFee =
    parseInt(graphRes.feeStat.mint) +
    parseInt(graphRes.feeStat.burn) +
    parseInt(graphRes.feeStat.marginAndLiquidation) +
    parseInt(graphRes.feeStat.swap);
  const finalDailyFee = dailyFee / 1e30;
  const userFee =
    parseInt(graphRes.feeStat.marginAndLiquidation) +
    parseInt(graphRes.feeStat.swap);
  const finalUserFee = userFee / 1e30;

  return {
    timestamp,
    dailyFees: finalDailyFee.toString(),
    dailyUserFees: finalUserFee.toString(),
    dailyRevenue: (finalDailyFee * 0.4).toString(),
    dailyHoldersRevenue: (finalDailyFee * 0.1).toString(),
    dailySupplySideRevenue: (finalDailyFee * 0.6).toString(),
  };
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.BASE]: {
      fetch: graphs(CHAIN.BASE),
      start: 1694304000,
      meta: {
        methodology,
      },
    },
  },
};

export default adapter;
