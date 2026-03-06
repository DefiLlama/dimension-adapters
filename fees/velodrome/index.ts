import { CHAIN } from "../../helpers/chains";
import { getAdapterFromHelpers } from "../../factory/registry";

const { adapter } = getAdapterFromHelpers('dexs', "velodrome") as any

let _fetch = adapter.adapter[CHAIN.OPTIMISM].fetch;
const fetch = async (options: any) => {
  let res = await (_fetch as any)(options)
  return {
    dailyFees: res.dailyFees,
    dailyRevenue: res.dailyFees,
    dailyHoldersRevenue: res.dailyFees,
  }
}

export default {
  pullHourly: true,
  version: 2,
  adapter: {
    [CHAIN.OPTIMISM]: {
      start: adapter.adapter[CHAIN.OPTIMISM].start,
      fetch,
    }
  }
}
