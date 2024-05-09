import { Adapter, FetchOptions, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { Chain, } from "@defillama/sdk/build/general";

type TAddress = {
  [l: string | Chain]: string;
}
const address: TAddress = {
  [CHAIN.ETHEREUM]: '0x9008d19f58aabd9ed0d60971565aa8510560ab41',
  [CHAIN.XDAI]: '0x9008d19f58aabd9ed0d60971565aa8510560ab41'
}


const fetch = (chain: Chain) => {
  return async (timestamp: number, _: any, options: FetchOptions): Promise<FetchResultFees> => {
    const logs = await options.getLogs({
      target: address[chain],
      eventAbi: "event Trade (address indexed owner, address sellToken, address buyToken, uint256 sellAmount, uint256 buyAmount, uint256 feeAmount, bytes orderUid)",
    })
    const dailyFees = options.createBalances();
    logs.forEach((tx: any) => {
      dailyFees.add(tx.sellToken, tx.feeAmount)
    })
    const dailyRevenue = dailyFees.clone()
    return { dailyUserFees: dailyFees, dailyFees, dailyRevenue, timestamp }
  }
}

const methodology = {
  UserFees: "Trading fees",
  Fees: "Trading fees",
  Revenue: "Trading fees - transation fees",
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch(CHAIN.ETHEREUM) as any,
      start: 1675382400,
      meta: {
        methodology
      }
    },
    // [CHAIN.XDAI]: {
    //   fetch: fetch(CHAIN.XDAI) as any,
    //   start: 1675382400,
    //   meta: {
    //     methodology
    //   }
    // }
  }
}

export default adapter;
