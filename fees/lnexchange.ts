import { CHAIN } from "../helpers/chains";
import { Adapter, FetchOptions } from "../adapters/types";
import BigNumber from "bignumber.js";
import { httpPost } from "../utils/fetchURL";
const fetchFees = async (options: FetchOptions) => {

  const resposePerp = await httpPost(
    `https://test-futures-api.ln.exchange/napi/common/getTradeFee`,
    {
      startTimestamp: options.startTimestamp * 1000,
      endTimestamp: options.endTimestamp * 1000,
    }
  );

  const resposeSpot = await httpPost(
    `https://test-spots-api.ln.exchange/napi/common/getTradeFee`,
    {
      startTimestamp: options.startTimestamp * 1000,
      endTimestamp: options.endTimestamp * 1000,
    }
  );

  const dailyFees = new BigNumber(resposePerp.data.dailyFees)
    .plus(resposeSpot.data.dailyFees)
    .toString();
  const totalFees = new BigNumber(resposePerp.data.totalFees)
    .plus(resposeSpot.data.totalFees)
    .toString();

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    totalFees,
    totalRevenue: totalFees,
  };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.LNEXCHANGE]: {
      fetch: fetchFees,
      start: "2024-10-20",
    },
  },
};
export default adapter;
