import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { getSolanaReceived } from "../../helpers/token"
import { METRIC } from "../../helpers/metrics"

//https://docs.odinbot.io/tracking-academy/how-to-look-at-your-fees
const FEE_RECIPIENT = "oDinBoTPS3Pz5gBv3FSTkPZXTyN3v7bZo6A2b3dooNP"

async function fetch(options: FetchOptions) {
  const tradingFees = await getSolanaReceived({
    options,
    target: FEE_RECIPIENT,
  })

  const dailyFees = tradingFees.clone(1, METRIC.TRADING_FEES)

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  }
}

const methodology = {
  Fees: "Odinbot charges a 0.1% fee on all trades (Min: 0.001 SOL), tracked via $SOL received by odin bot fees wallet.",
  Revenue: "All the trading fees (0.1% of trade value, min 0.001 SOL) are revenue to Odinbot.",
  ProtocolRevenue: "All the trading fees (0.1% of trade value, min 0.001 SOL) are revenue to Odinbot.",
}

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: "0.1% of trade value, min 0.001 SOL",
  },
  Revenue: {
    [METRIC.TRADING_FEES]: "0.1% of trade value, min 0.001 SOL",
  },
  ProtocolRevenue: {
    [METRIC.TRADING_FEES]: "0.1% of trade value, min 0.001 SOL",
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.SOLANA],
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  start: "2025-09-30",
  methodology,
  breakdownMethodology,
}

export default adapter;