import { FetchOptions, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"

const TREASURY = "0x84be56470d45b7f6629a66a219a38681f6ba6172"
const USDC = "0xaf88d065e77c8cc2239327c5edb3a432268e5831"

const methodology = {
  Fees:
    "Variational charges a fixed 0.1 USDC fee on each deposit and withdrawal into the Omni Liquidity Pool (OLP). " +
    "The platform has zero trading fees. Only the spam-prevention fees on deposits/withdrawals are tracked.",
  UserFees: "Users pay the 0.1 USDC spam-prevention fee when depositing or withdrawing from the OLP vault.",
  Revenue:
    "Spam-prevention fees (0.1 USDC per transaction) accrue to the protocol treasury. " +
    "LP spread/yield is not included as it's not a direct user fee.",
  ProtocolRevenue: "Protocol revenue equals the collected spam-prevention fees; there is no maker/taker trading fee.",
}

const fetch = async ({ createBalances, getLogs }: FetchOptions) => {
  const dailyFees = createBalances()

  // FeeBatchProcessed aggregates the 0.1 USDC deposit/withdraw fees before routing them to the treasury
  const logs = await getLogs({
    target: TREASURY,
    eventAbi: "event FeeBatchProcessed((uint128 poolId,uint256 fee,uint128 netAmount)[] poolData,(uint128 kind,string message)[] metadata)",
    parseLog: true,
  })

  logs.forEach((log: any) => {
    const poolData = log.poolData || []
    
    poolData.forEach((entry: any) => {
      const fee = entry.fee
      
      // Only count exactly 0.1 and 0.2 USDC spam-prevention fees (100000 and 200000 units)
      // FeeBatchProcessed also includes LP spread/yield and variable fees which are NOT user fees
      if (fee === 100000n || fee === 200000n) {
        dailyFees.add(USDC, fee)
      }
    })
  })

  return {
    dailyFees,                   
    dailyUserFees: dailyFees,    
    dailyRevenue: dailyFees,      
    dailyProtocolRevenue: dailyFees,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  methodology,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch,
      start: "2024-06-01",
    },
  },
}

export default adapter