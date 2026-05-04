import { Adapter, FetchOptions, FetchV2 } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

/**
 * FrenFlow — social copytrading + trading UI for prediction markets.
 * https://frenflow.com  ·  https://x.com/frenflow_
 *
 * Revenue model: a 1% service fee on manual trades routed through
 * FrenFlow's Safe wallet infrastructure on Polymarket. At trade
 * settlement, the FeeCollector contract pulls the fee atomically
 * (user → treasury) and emits a `FeeCollected` event with the exact
 * feeAmount. We sum those events for the period.
 *
 * Volume for FrenFlow as a Polymarket builder is tracked separately
 * through `factory/polymarket.ts` (Polymarket's official builder
 * volume API). This file covers only the service-fee revenue.
 *
 * Income-statement mapping (per GUIDELINES):
 *   dailyFees            — gross protocol revenue (all sources)
 *   dailyUserFees        — portion directly paid by end-users
 *                          (100% here: the fee is pulled from the
 *                          user's wallet at trade settlement)
 *   dailyRevenue         — gross profit (no supply-side to reimburse)
 *   dailyProtocolRevenue — portion allocated to treasury (100%)
 */

// Production FeeCollector on Polygon — live since 2026-04-20 (first V2
// prod trade, tx 0xcd88b05b…). Contract: contracts/src/FeeCollector.sol
const FEE_COLLECTOR = "0x95e47CBC5c4D9434412AF44Ade02B33613EDb787";

// USDC.e (bridged) on Polygon — the only token the FeeCollector pulls.
// pUSD-denominated Polymarket trades wrap into USDC.e pre-fee, so every
// `FeeCollected` event is denominated in this token.
const USDC_E_POLYGON = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";

const FEE_LABEL = "Service Fees";

const fetch: FetchV2 = async ({ getLogs, createBalances }: FetchOptions) => {
  const dailyFees = createBalances();

  const logs = await getLogs({
    target: FEE_COLLECTOR,
    eventAbi:
      "event FeeCollected(bytes32 indexed fillId, address indexed user, bytes32 indexed tokenId, uint8 service, uint256 tradeAmount, uint256 feeAmount, uint256 feeBps, uint256 timestamp)",
  });

  for (const log of logs) {
    dailyFees.add(USDC_E_POLYGON, log.feeAmount, FEE_LABEL);
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees,
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
      "Service fee (1%) pulled atomically user → treasury inside FrenFlow's FeeCollector contract on Polygon at Polymarket trade settlement.",
    UserFees:
      "100% of fees come directly from end-user wallets (the fee is transferFrom'd from the trader at fill).",
    Revenue:
      "All service fees flow directly to the FrenFlow treasury. No liquidity providers.",
    ProtocolRevenue:
      "Same as Revenue — 100% of collected fees are retained by the protocol.",
  },
  breakdownMethodology: {
    Fees: {
      [FEE_LABEL]:
        "Per-trade 1% service fee on Polymarket trades routed through FrenFlow. Denominated in USDC.e. Tracked from the `FeeCollected` event on the FeeCollector contract.",
    },
    UserFees: {
      [FEE_LABEL]: "Same as Fees — paid directly from the trader's wallet.",
    },
    Revenue: {
      [FEE_LABEL]:
        "100% of collected service fees flow to the FrenFlow treasury at `0xb9e912e55454Ce284C38ccFED5b7fbbF327E689b`.",
    },
    ProtocolRevenue: {
      [FEE_LABEL]: "Same as Revenue — fully retained by the protocol.",
    },
  },
};

export default adapter;
