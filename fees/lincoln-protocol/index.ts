// DefiLlama fees/revenue adapter — Lincoln Protocol (Robinhood Chain).
// Destination: DefiLlama/dimension-adapters  fees/lincoln-protocol/index.ts
// STATUS: DRAFT. Addresses are placeholders until the mainnet deployment manifest exists.
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// pool address -> asset (ZERO = native ETH). Fill from config/phase2-mainnet-deployed.json.
const POOLS: Record<string, string> = {
  // "0x...eth-pool": "0x0000000000000000000000000000000000000000",
  // "0x...usdg-pool": "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
};
// Fee route adapters (one per direction, immutable 30 bps to the Safe treasury).
const FEE_ADAPTERS: string[] = [
  // "0x...usdg-to-nvda-adapter",
];

// PrivacyPool events (core rc.3 ABI). `fee` is paid by the user out of the public amount.
const PUBLIC_FLOW =
  "event PublicFlow(address indexed processor, address indexed recipient, address indexed feeRecipient, uint256 publicIn, uint256 publicOut, uint256 fee)";
const HOLDER_EXITED =
  "event HolderExited(address indexed processor, address indexed recipient, uint256 indexed commitment, uint256 nullifier, uint256 value, uint256 fee, address feeRecipient)";
// Fee route adapter event: serviceFee is sent to the treasury in the output token.
const SERVICE_FEE_PAID =
  "event ServiceFeePaid(address indexed treasury, address indexed token, uint256 grossAmountOut, uint256 serviceFee, uint256 netAmountOut)";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  for (const [pool, asset] of Object.entries(POOLS)) {
    const flows: any[] = await options.getLogs({ target: pool, eventAbi: PUBLIC_FLOW });
    const exits: any[] = await options.getLogs({ target: pool, eventAbi: HOLDER_EXITED });
    for (const log of flows) if (log.fee > 0n) dailyFees.add(asset, log.fee, "Relay fees");
    for (const log of exits) if (log.fee > 0n) dailyFees.add(asset, log.fee, "Relay fees");
  }
  if (FEE_ADAPTERS.length) {
    const swaps: any[] = await options.getLogs({ targets: FEE_ADAPTERS, eventAbi: SERVICE_FEE_PAID });
    for (const log of swaps) {
      dailyFees.add(log.token, log.serviceFee, "Swap service fees");
      dailyProtocolRevenue.add(log.token, log.serviceFee, "Swap service fees");
    }
  }
  // Relay fees are collected by the protocol-operated relays; swap fees go to the treasury Safe.
  // There are no LPs, so every fee is protocol revenue.
  return { dailyFees, dailyRevenue: dailyFees, dailyUserFees: dailyFees, dailyProtocolRevenue: dailyFees };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  // start: "2026-MM-DD", // mainnet deployment date
  methodology: {
    Fees: "Relay fees paid by users on private withdrawals, transfers and holder exits (30 bps plus a fixed gas quote), and the immutable 30 bps service fee on private swaps through the fee route adapters. Ragequit is free.",
    UserFees: "Identical to Fees: every fee is paid by the end user out of the amount moved.",
    Revenue: "All fees. Lincoln has no liquidity providers or token holders sharing fees.",
    ProtocolRevenue: "Swap service fees are paid to the treasury Safe; relay fees accrue to the protocol-operated relays.",
  },
  breakdownMethodology: {
    Fees: {
      "Relay fees": "The `fee` field of PublicFlow and HolderExited events on each privacy pool, denominated in the pool asset.",
      "Swap service fees": "The `serviceFee` field of ServiceFeePaid events on each fee route adapter, denominated in the output token.",
    },
  },
};

export default adapter;
