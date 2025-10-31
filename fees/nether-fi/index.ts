import * as sdk from "@defillama/sdk";
import { Adapter, Fetch } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";

const subgraphEndpoint = "https://api.studio.thegraph.com/query/51510/nefi-base-mainnet-stats/version/latest";
const startTimestamp = 1693526400;

const methodology = {
  Fees: "Open/Close position: 0.1% | Swap: 0.2% to 0.8% | Mint and Burn: 0% to 0.85% (based on tokens balance in the pool) | Borrow Fee: `(assets borrowed) / (total assets in pool) * 0.01%`",
  UserFees:
    "Open/Close position: 0.1% | Swap: 0.2% to 0.8% | Borrow Fee: (assets borrowed) / (total assets in pool) * 0.01%",
  HoldersRevenue: "30% of all collected fees goes to NFI and esNFI stakers",
  SupplySideRevenue: "70% of all collected fees goes to NLP holders",
  Revenue: "Revenue is 30% of all collected fees, which goes to NFI and esNFI stakers",
  ProtocolRevenue: "Treasury has no revenue",
};

const fetch = async (timestamp: number) => {
  const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp);
  const searchTimestamp = todaysTimestamp + ":daily";

  const graphQuery = `{
    feeStat(id: "${searchTimestamp}") {
      mint
      burn
      marginAndLiquidation
      swap
    }
  }`;
  const graphRes = await sdk.graph.request(subgraphEndpoint, graphQuery);
  const dailyFee =
    parseInt(graphRes.feeStat.mint) +
    parseInt(graphRes.feeStat.burn) +
    parseInt(graphRes.feeStat.marginAndLiquidation) +
    parseInt(graphRes.feeStat.swap);
  const finalDailyFee = dailyFee / 1e30;
  const userFee = parseInt(graphRes.feeStat.marginAndLiquidation) + parseInt(graphRes.feeStat.swap);
  const finalUserFee = userFee / 1e30;

  return {
    dailyFees: finalDailyFee.toString(),
    dailyUserFees: finalUserFee.toString(),
    dailyRevenue: (finalDailyFee * 0.3).toString(),
    dailyProtocolRevenue: "0",
    dailyHoldersRevenue: (finalDailyFee * 0.3).toString(),
    dailySupplySideRevenue: (finalDailyFee * 0.7).toString(),
  };
}

const adapter: Adapter = {
  version: 1,
  deadFrom: '2025-01-28',
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: startTimestamp,
    },
  },
  methodology,
};

export default adapter;
