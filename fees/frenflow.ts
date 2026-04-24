import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

/**
 * FrenFlow — social copytrading + trading UI for prediction markets.
 * https://frenflow.com  ·  https://x.com/frenflow_
 *
 * Revenue model: a service fee (default 1%, dynamic on certain venues)
 * on every trade routed through FrenFlow's Safe wallet infrastructure
 * on Polymarket. At trade settlement, the FeeCollector contract pulls
 * the fee atomically (user → treasury) and emits a `FeeCollected` event
 * with the exact feeAmount. We sum those events for the period.
 *
 * Kalshi (Solana via DFlow) and Predict.fun (BSC) settle through
 * separate fee paths not yet tracked in this adapter. They account
 * for a small share of current volume and will be added as they grow.
 */

// Production FeeCollector on Polygon — live since 2026-04-20 (first V2
// prod trade, tx 0xcd88b05b…). Contract: contracts/src/FeeCollector.sol
const FEE_COLLECTOR = "0x95e47CBC5c4D9434412AF44Ade02B33613EDb787";

// USDC.e (bridged) on Polygon — the only token the FeeCollector pulls.
// pUSD-denominated Polymarket trades wrap into USDC.e pre-fee, so every
// `FeeCollected` event is denominated in this token.
const USDC_E_POLYGON = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";

const fetch: any = async ({ getLogs, createBalances }: FetchOptions) => {
  const dailyFees = createBalances();

  // Direct event-level aggregation. `feeAmount` is uint256 in USDC.e
  // native decimals (6); DefiLlama's `balances.add(token, amount)`
  // handles the decimals + market price internally.
  const logs = await getLogs({
    target: FEE_COLLECTOR,
    eventAbi:
      "event FeeCollected(bytes32 indexed fillId, address indexed user, bytes32 indexed tokenId, uint8 service, uint256 tradeAmount, uint256 feeAmount, uint256 feeBps, uint256 timestamp)",
  });

  for (const log of logs) {
    dailyFees.add(USDC_E_POLYGON, log.feeAmount);
  }

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const adapter: Adapter = {
  version: 2,
  chains: [CHAIN.POLYGON],
  fetch,
  start: "2026-04-20",
  pullHourly: true,
  methodology: {
    Fees:
      "Service fee (default 1%) pulled atomically user → treasury inside FrenFlow's FeeCollector contract on Polygon at Polymarket trade settlement.",
    Revenue:
      "All service fees flow directly to the FrenFlow treasury. No liquidity providers.",
    ProtocolRevenue:
      "Same as Revenue — 100% of collected fees are retained by the protocol.",
  },
  breakdownMethodology: {
    Fees: {
      "Service Fees":
        "Per-trade service fee on Polymarket trades routed through FrenFlow. Denominated in USDC.e. Kalshi (Solana via DFlow) and Predict.fun (BSC) fee paths are not yet tracked in this adapter.",
    },
    Revenue: {
      "Service Fees":
        "100% of collected service fees flow to the FrenFlow treasury at `0xb9e912e55454Ce284C38ccFED5b7fbbF327E689b`.",
    },
  },
};

export default adapter;
