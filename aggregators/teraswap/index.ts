import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const SWAP_WITH_FEE_EVENT =
  'event SwapWithFee(address indexed user, address indexed router, address tokenIn, uint256 totalAmount, uint256 feeAmount, address tokenOut, uint256 outputAmount)'

const chainConfig: Record<string, { feeCollector: string; start: string }> = {
  [CHAIN.ETHEREUM]: {
    feeCollector: '0x47f24068932Ac49bcbeD3aD105af57C6ECDF7459',
    start: '2026-05-08',
  },
  [CHAIN.BASE]: {
    feeCollector: '0xeFC31ADb5d10c51Ac4383bB770E2fdC65780f130',
    start: '2026-05-30',
  },
}

const fetch = async (options: FetchOptions) => {
  const target = chainConfig[options.chain].feeCollector

  const logs = await options.getLogs({
    target,
    eventAbi: SWAP_WITH_FEE_EVENT,
  })

  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()

  for (const log of logs) {
    dailyVolume.add(log.tokenIn, log.totalAmount)
    dailyFees.add(log.tokenIn, log.feeAmount, METRIC.SWAP_FEES)
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  }
}

const methodology = {
  Volume: 'Sum of totalAmount (the pre-fee swap notional a user commits, in tokenIn) from every SwapWithFee event emitted by the TeraSwapFeeCollector proxy — the single contract every TeraSwap swap routes fee-collection through before being forwarded to the underlying DEX router.',
  Fees: 'A flat 0.1% (10 bps) fee taken by the FeeCollector on every swap, read directly from the feeAmount field of each SwapWithFee event (no estimation — the exact on-chain value).',
  Revenue: "A flat 0.1% (10 bps) fee taken by the FeeCollector on every swap, read directly from the feeAmount field of each SwapWithFee event (no estimation — the exact on-chain value).",
  ProtocolRevenue: "A flat 0.1% (10 bps) fee taken by the FeeCollector on every swap, read directly from the feeAmount field of each SwapWithFee event (no estimation — the exact on-chain value).",
}

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: 'A flat 0.1% (10 bps) fee taken by the FeeCollector on every swap.',
  },
  Revenue: {
    [METRIC.SWAP_FEES]: 'A flat 0.1% (10 bps) fee taken by the FeeCollector on every swap.',
  },
  ProtocolRevenue: {
    [METRIC.SWAP_FEES]: 'A flat 0.1% (10 bps) fee taken by the FeeCollector on every swap.',
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  methodology,
  breakdownMethodology,
}

export default adapter
