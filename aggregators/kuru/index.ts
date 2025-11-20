import { FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import * as sdk from "@defillama/sdk";

const abis = {
  "KuruFlowSwap": "event KuruFlowSwap(address indexed user,address indexed referrer,address tokenIn,address tokenOut,bool isFeeInInput,uint256 amountIn,uint256 amountOut,uint256 referrerFeeBps,uint256 totalFeeBps)",
  "FeeCollected": "FeeCollected(address feeCollector, uint256 amount, address referrer, uint256 referrerAmount, address user, address token)",
}

const fetch = async (_:any, _1: any, { createBalances, getLogs, }: FetchOptions) => {
  const dailyVolume = createBalances()
  const dailyFees = createBalances()
  const KuruFlowEntrypoint = '0xb3e6778480b2E488385E8205eA05E20060B813cb'

  sdk.log('[KURU] Fetching swap events...');

  // Get swap events for volume
  const swapLogs = await getLogs({ 
    target: KuruFlowEntrypoint, 
    eventAbi: abis.KuruFlowSwap, 
  })
  
  swapLogs.forEach((log: any) => {
    dailyVolume.add(log.tokenIn, log.amountIn)
  })

  // Get fee collection events
  const feeLogs = await getLogs({ 
    target: KuruFlowEntrypoint, 
    eventAbi: abis.FeeCollected, 
  })
  
  // Calculate total fees = amount + referrerAmount
  feeLogs.forEach((log: any) => {
    const totalFee = BigInt(log.amount) + BigInt(log.referrerAmount)
    dailyFees.add(log.token, totalFee)
  })

  return { 
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  }
};

const adapter: any = {
  fetch,
  adapter: {
    [CHAIN.MONAD]: { start: '2025-11-17', },
  },
  methodology: {
    Volume: "Sum of all token swaps routed through KURU Aggregator",
    Fees: "Total fees collected from users (protocol fee + referrer fee)",
    UserFees: "All fees are paid by users",
    Revenue: "All fees collected go to protocol and referrers",
    ProtocolRevenue: "All fees collected by protocol (includes referrer portion)",
  }
};

export default adapter;
