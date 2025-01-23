import { CHAIN } from "../helpers/chains";
import { Adapter, FetchOptions } from "../adapters/types";
import { httpPost } from "../utils/fetchURL";

const fetchPerpFees = async (options: FetchOptions) => {
  const respose = await httpPost(
    `https://test-futures-api.ln.exchange/napi/common/getTradeFee`,
    {
      startTimestamp: options.startTimestamp * 1000,
      endTimestamp: options.endTimestamp * 1000,
    }
  );

  const dailyFees = respose.data.dailyFees;
  const totalFees = respose.data.totalFees;

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
    [CHAIN.BITCOIN]: {
      fetch: fetchPerpFees,
      start: "2024-10-20",
    },
  },
};
export default adapter;
