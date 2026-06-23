import { CHAIN } from "../../helpers/chains";
import { getAdapterFromHelpers } from "../../factory/registry";

const { adapter } = getAdapterFromHelpers('dexs', "velodrome") as any

let _fetch = adapter.adapter[CHAIN.OPTIMISM].fetch;
const fetch = async (options: any) => {
  let res = await (_fetch as any)(options)
  return {
    dailyFees: res.dailyFees.clone(1, 'Token Swap Fees'),
    dailyRevenue: res.dailyFees.clone(1, 'Swap Fees To Voters'),
    dailyHoldersRevenue: res.dailyFees.clone(1, 'Swap Fees To Voters'),
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
  },
  methodology: {
    Fees: 'Token swap fees paid by users.',
    Revenue: 'Swap fees distributed to VELO token holders.',
    HoldersRevenue: 'Swap fees dfistributed to VELO token holders.',
  },
  breakdownMethodology: {
    Fees: {
      'Token Swap Fees': 'Token swap fees paid by users.',
    },
    Revenue: {
      'Swap Fees To Voters': 'Swap fees dfistributed to VELO token holders.',
    },
    HoldersRevenue: {
      'Swap Fees To Voters': 'Swap fees dfistributed to VELO token holders.',
    },
  }
}
