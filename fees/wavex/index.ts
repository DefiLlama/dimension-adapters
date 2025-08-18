import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import type { FetchV2 } from "../../adapters/types";
import axios from "axios";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";

const endpoints: any = {
  [CHAIN.SONEIUM]: "https://wavex-indexer-serve-mainnet.up.railway.app",
};

const methodology = {
  Fees: "Fees from open/close position (0.1%), swap (stableSwapFee: 0% - 0.06%, swapFee: 0% - 0.85%), deposit and withdraw (based on the total asset amount in the LP pool) and borrow fee ((assets borrowed)/(total assets in pool)*0.01%)",
  SupplySideRevenue: "50% of all collected fees goes to WLP holders",
  ProtocolRevenue:
    "Until waveX’s tokenomics and governance framework are fully established, the remaining 50% of fees will go to the Treasury.",
};

const fetch: FetchV2 = async ({ chain, endTimestamp }) => {
  const todaysTimestamp = getTimestampAtStartOfDayUTC(endTimestamp);

  const res = await axios.get(
    `${endpoints[chain]}/stats/fees?timestamp=${todaysTimestamp}`
  );
  const dailyFee =
    parseInt(res.data.data.mint) +
    parseInt(res.data.data.burn) +
    parseInt(res.data.data.marginAndLiquidation) +
    parseInt(res.data.data.swap);
  const finalDailyFee = dailyFee / 1e30;
  const userFee =
    parseInt(res.data.data.marginAndLiquidation) + parseInt(res.data.data.swap);
  const finalUserFee = userFee / 1e30;

  return {
    dailyFees: finalDailyFee.toString(),
    dailyUserFees: finalUserFee.toString(),
    dailyRevenue: (finalDailyFee * 0.5).toString(),
    dailyProtocolRevenue: (finalDailyFee * 0.5).toString(),
    dailySupplySideRevenue: (finalDailyFee * 0.5).toString(),
  };
};

const adapter: Adapter = {
  version: 2,
  methodology,
  adapter: {
    [CHAIN.SONEIUM]: {
      fetch,
      start: "2024-12-27",
    },
  },
};

export default adapter;
