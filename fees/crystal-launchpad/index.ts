import { Adapter, FetchOptions } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"

const CRYSTAL = "0x4De0D89d8DE993cD8a71a836BBD4fbB57436bfc3"
const abi = {
  weth: 'function weth() view returns (address)',
  launchpadParams: 'function launchpadParams() view returns (bool,uint112,uint256,uint256,uint256,uint256,uint256,uint256)',
  LaunchpadTrade: 'event LaunchpadTrade(address indexed token, address indexed user, bool isBuy, uint256 amountIn, uint256 amountOut, uint256 virtualNativeReserve, uint256 virtualTokenReserve)',
}

const fetch = async ({ api, getLogs, createBalances }: FetchOptions) => {
  const dailyFees = createBalances()
  const dailyRevenue = createBalances()
  const weth: string = await api.call({ target: CRYSTAL, abi: abi.weth })
  const params: any = await api.call({ target: CRYSTAL, abi: abi.launchpadParams })
  const fee = BigInt(params[2])
  const creatorSplit = BigInt(params[3])
  const spread = 100000n - fee
  const logs = await getLogs({ target: CRYSTAL, eventAbi: abi.LaunchpadTrade })
  for (const l of logs) {
    const feeAmt = l.isBuy ? BigInt(l.amountIn) * spread / 100000n : BigInt(l.amountOut) * spread / fee
    dailyFees.add(weth, feeAmt.toString())
    dailyRevenue.add(weth, (feeAmt * (100n - creatorSplit) / 100n).toString())
  }
  return { dailyFees, dailyUserFees: dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue }
}

const adapter: Adapter = {
  version: 2,
  fetch,
  chains: [CHAIN.MONAD],
  start: "2026-09-19",
  methodology: {
    Fees: "Launchpad bonding-curve fees paid by users on every buy/sell (in native token).",
    UserFees: "Same as Fees.",
    Revenue: "Portion of launchpad fees routed to the Crystal governance address (excludes token creator's split).",
    ProtocolRevenue: "Same as Revenue.",
  },
}

export default adapter
