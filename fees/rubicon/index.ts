import { Adapter, FetchOptions } from "../../adapters/types";
import { addTokensReceived } from "../../helpers/token";
import { CHAIN } from "../../helpers/chains";

const fetch = async (options: FetchOptions) => {
  const dailyFees = await addTokensReceived({
    options,
    targets: ["0x752748deaf25cf58b60d4c4209d7f200aee4ef14"]
  })
  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees}
}

const methodology = {
          Fees: "All fees collected by Rubicon Protocol",
          Revenue: "All fees collected by Rubicon Protocol",
          ProtocolRevenue: "All fees collected by Rubicon Protocol"
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2024-07-27',
      meta: {
        methodology
      }      
    },
    [CHAIN.OPTIMISM]: {
      fetch,
      start: '2021-11-28',
      meta: {
        methodology
      }      
    },
    [CHAIN.ARBITRUM]: {
      fetch,
      start: '2023-06-21',
      meta: {
        methodology
      }      
    },
    [CHAIN.BASE]: {
      fetch,
      start: '2023-08-08',
      meta: {
        methodology
      }      
    }
  }
}

export default adapter;

