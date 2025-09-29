import { Adapter, FetchOptions } from "../../adapters/types";
import { addTokensReceived } from "../../helpers/token";
import { CHAIN } from "../../helpers/chains";

const fetch = async (options: FetchOptions) => {
  const dailyFees = await addTokensReceived({
    options,
    targets: ["0x752748deaf25cf58b60d4c4209d7f200aee4ef14"]
  })
  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees }
}

const methodology = {
  Fees: "All fees collected by Rubicon Protocol",
  Revenue: "All fees collected by Rubicon Protocol",
  ProtocolRevenue: "All fees collected by Rubicon Protocol"
}

const adapter: Adapter = {
  version: 2,
  fetch,
  methodology,
  adapter: {
    [CHAIN.ETHEREUM]: {
      start: '2024-07-27',
    },
    [CHAIN.OPTIMISM]: {
      start: '2021-11-28',
    },
    [CHAIN.ARBITRUM]: {
      start: '2023-06-21',
    },
    [CHAIN.BASE]: {
      start: '2023-08-08',
    }
  }
}

export default adapter;

