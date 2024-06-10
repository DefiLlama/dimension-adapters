import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const wenFoundry: any = {
  [CHAIN.POLYGON]: "0x3bb94837a91e22a134053b9f38728e27055ec3d1"
}
const event_buy = "event Buy(address indexed token,address indexed sender,uint256 amountIn,uint256 amountOut,address indexed to)"
const fetchFees = async (options: FetchOptions) => {
  const amountIn = options.createBalances()
  const logs = await options.getLogs({
    target: wenFoundry[options.chain],
    eventAbi: event_buy,
    flatten: false,
  })
  logs.forEach((log: any) => {
    amountIn.addGasToken(log.amountIn)
  })
  const dailyFees = amountIn.clone()
  dailyFees.resizeBy(0.01) // 1% of trading volume

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees
  }
}
const adapters: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.POLYGON]: {
      fetch: fetchFees,
      start: 1630000000
    },
  }
}
export default adapters;
