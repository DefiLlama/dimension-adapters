import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import type { FetchV2 } from "../../adapters/types";
import axios from "axios";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";

const endpoints: any = {
  [CHAIN.SONEIUM]: "https://wavex-indexer-serve-mainnet.up.railway.app/",
};

const methodology = {
  Fees: "Fees from open/close position (0.1%), swap (0.2% to 0.8%), deposit and withdraw (based on the total asset amount in the LP pool) and borrow fee ((assets borrowed)/(total assets in pool)*0.01%)",
};

const fetch: FetchV2 = async ({ chain, endTimestamp }) => {
  const todaysTimestamp = getTimestampAtStartOfDayUTC(endTimestamp);

  const res = await axios.get(
    `${endpoints[chain]}/stats/fees?timestamp=${todaysTimestamp}`
  );
  const dailyFee =
    parseInt(res.data.mint) +
    parseInt(res.data.burn) +
    parseInt(res.data.marginAndLiquidation) +
    parseInt(res.data.swap);
  const finalDailyFee = dailyFee / 1e30;
  const userFee =
    parseInt(res.data.marginAndLiquidation) + parseInt(res.data.swap);
  const finalUserFee = userFee / 1e30;

  return {
    dailyFees: finalDailyFee.toString(),
    dailyUserFees: finalUserFee.toString(),
    dailyRevenue: (finalDailyFee * 0.3).toString(),
    dailyProtocolRevenue: "0",
    totalProtocolRevenue: "0",
    dailyHoldersRevenue: (finalDailyFee * 0.3).toString(),
    dailySupplySideRevenue: (finalDailyFee * 0.7).toString(),
  };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.SONEIUM]: {
      fetch,
      start: "2024-12-27",
      meta: {
        methodology,
      },
    },
  },
};

export default adapter;
