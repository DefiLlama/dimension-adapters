import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getBuilderExports } from "../../helpers/orderly";

const methodology = {
  Fees: "Builder Fees collected from Orderly Network(0.3 bps on taker volume)",
  Revenue: "All the fees collected",
  ProtocolRevenue: "All the revenue go to the protocol",
}

const adapter = getBuilderExports({ broker_id: 'baumz-1024', start: '2025-11-08', methodology }) as SimpleAdapter

adapter.adapter = {
  [CHAIN.ORDERLY]: { 
    start: '2025-11-08',
    fetch: async function(_: any, _1: any, options: FetchOptions) {
      return {
        ...(await (adapter.fetch as any)(_, _1, options)),
        dailyHoldersRevenue: 0,
      }
    },
  },
}

export default adapter