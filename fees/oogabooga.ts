import type { FetchOptions } from "../adapters/types"
import { CHAIN } from "../helpers/chains"

const swapEvent = "event Swap(address indexed sender,uint256 inputAmount,address indexed inputToken,uint256 amountOut,address indexed outputToken,int256 slippage,uint32 referralCode,address to)"

const quoteEvent = "event Fee(address feeToken, uint256 feeAmount, uint256 obQuote, uint256 bexQuote, uint256 kodiakQuote)"

const OBEXECUTOR_FEE_MODULE = "0xF83ECD5511cf190764Be32D2F9eCeD57a8676cdc"
const OBROUTER = "0xFd88aD4849BA0F729D6fF4bC27Ff948Ab1Ac3dE7"

async function fetch({ getLogs, createBalances }: FetchOptions) {
  const dailyFees = createBalances()

  const swapEvents = await getLogs({ targets: [OBROUTER], eventAbi: swapEvent, })

  // Positive slippage
  for (const l of swapEvents)
    dailyFees.add(l.outputToken, l.slippage > 0n ? l.slippage : 0)

  // Swap fees
  const feeEvents = await getLogs({ targets: [OBEXECUTOR_FEE_MODULE], eventAbi: quoteEvent, })

  for (const l of feeEvents)
    dailyFees.add(l.feeToken, l.feeAmount)

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees }
}

export default {
  version: 2,
  adapter: {
    [CHAIN.BERACHAIN]: {
      fetch: fetch,
      start: '2025-01-27',
    },
  },
}