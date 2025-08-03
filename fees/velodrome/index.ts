import adapter from "../../dexs/velodrome";
import { CHAIN } from "../../helpers/chains";

let _fetch = adapter.adapter[CHAIN.OPTIMISM].fetch;
const fetch = async (options) => {
  let res = await (_fetch as any)(options)
  return {
    dailyFees: res.dailyFees,
    dailyRevenue: res.dailyFees,
    dailyHoldersRevenue: res.dailyFees,
  }
}

export default {
  version: 2,
  adapter: {
    [CHAIN.OPTIMISM]: {
      start: adapter.adapter[CHAIN.OPTIMISM].start,
      fetch,
    }
  }
}
