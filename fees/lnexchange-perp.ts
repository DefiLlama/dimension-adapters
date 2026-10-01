import { CHAIN } from "../helpers/chains";
import { Adapter, FetchOptions } from "../adapters/types";
import { httpPost } from "../utils/fetchURL";

const fetch = async (options: FetchOptions) => {
  const respose = await httpPost(
    `https://test-futures-api.ln.exchange/napi/common/getTradeFee`,
    {
      startTimestamp: options.startTimestamp * 1000,
      endTimestamp: options.endTimestamp * 1000,
    }
  );

  const dailyFees = respose.data.dailyFees;

  return {
    dailyFees,
    dailyRevenue: dailyFees,
  };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    // Orders are matched by the operator over Nostr and funds sit on LN Exchange's Lightning
    // node (managed custody); nothing trade-related touches Bitcoin L1, so the venue is keyed
    // as off_chain rather than Bitcoin.
    [CHAIN.OFF_CHAIN]: {
      fetch,
      start: "2024-10-20",
    },
  },
};
export default adapter;
