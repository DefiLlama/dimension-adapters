// DefiLlama fees / revenue adapter for Arctide (Arc). Drop-in file for
// https://github.com/DefiLlama/dimension-adapters -> fees/arctide/index.ts
//
// Every Arctide pair only accepts swaps from the Arctide Router, and the Router emits
// SwapExecuted with the exact fee split of each trade in native USDC (18-decimal wei):
//   lpFeeNative        -> liquidity providers (Euler ledger)
//   protocolFeeNative  -> the address the token's creator chose (protocolRecipient)
//   treasuryFeeNative  -> Arctide (fixed 25 bps)
// Limit orders execute through the same Router, so they are included. Bonding-curve trades
// in the launch factory carry no fee, so they contribute nothing here.
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const ROUTER = "0xA161f98765b396D126D25C0FF7546F9FCeA9B082";
const USDC = "0x3600000000000000000000000000000000000000"; // 6-decimal ERC-20 view of native USDC

const SWAP_EXECUTED =
  "event SwapExecuted(address indexed pair, address indexed token, address indexed trader, address recipient, bool isBuy, uint16 totalFeeBps, uint256 grossNative, uint256 ammBaseAmount, uint256 tokenAmount, uint256 lpFeeNative, uint256 protocolFeeNative, uint256 treasuryFeeNative, address protocolRecipient, address treasuryRecipient)";

// Protocol-fee recipients that belong to Arctide itself. Protocol fees paid to these count as
// Arctide revenue; protocol fees paid to anyone else are token creators' revenue (supply side).
// 0x4F6a...4269 is the creator and protocol() recipient of the $TIDE and $DUCK pairs (read on chain,
// 22 Sep 2026); it funds the announced $TIDE buybacks. The treasury recipient is matched from the event.
const ARCTIDE_PROTOCOL_RECIPIENTS = new Set<string>([
  "0x4F6aa4D866df5B8e25cc06bC1CFedbF123584269",
].map((a) => a.toLowerCase()));

// Share of Arctide revenue committed to buying back and burning $TIDE (announced 16 Sep 2026).
const HOLDERS_SHARE = 0.7;

const TREASURY_FEE = "Treasury Fee";

// Native USDC has 18 decimals on Arc; the ERC-20 view has 6. Totals are summed in wei first and
// converted once, so no per-trade remainder is lost.
const toUsdc = (wei: bigint): bigint => wei / 10n ** 12n;

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  let lpNative = 0n;
  let creatorProtocolNative = 0n;
  let arctideProtocolNative = 0n;
  let treasuryNative = 0n;

  const logs = await options.getLogs({ target: ROUTER, eventAbi: SWAP_EXECUTED });
  for (const log of logs) {
    const protocol = BigInt(log.protocolFeeNative);
    lpNative += BigInt(log.lpFeeNative);
    treasuryNative += BigInt(log.treasuryFeeNative);

    const recipient = String(log.protocolRecipient).toLowerCase();
    const arctideOwned =
      recipient === String(log.treasuryRecipient).toLowerCase() || ARCTIDE_PROTOCOL_RECIPIENTS.has(recipient);
    if (arctideOwned) arctideProtocolNative += protocol;
    else creatorProtocolNative += protocol;
  }

  const lpUsdc = toUsdc(lpNative);
  const creatorUsdc = toUsdc(creatorProtocolNative);
  const arctideUsdc = toUsdc(arctideProtocolNative);
  const treasuryUsdc = toUsdc(treasuryNative);

  dailyFees.add(USDC, lpUsdc, METRIC.LP_FEES);
  dailyFees.add(USDC, creatorUsdc, METRIC.CREATOR_FEES);
  dailyFees.add(USDC, arctideUsdc, METRIC.PROTOCOL_FEES);
  dailyFees.add(USDC, treasuryUsdc, TREASURY_FEE);

  dailySupplySideRevenue.add(USDC, lpUsdc, METRIC.LP_FEES);
  dailySupplySideRevenue.add(USDC, creatorUsdc, METRIC.CREATOR_FEES);

  dailyRevenue.add(USDC, arctideUsdc, METRIC.PROTOCOL_FEES);
  dailyRevenue.add(USDC, treasuryUsdc, TREASURY_FEE);

  const dailyHoldersRevenue = dailyRevenue.clone(HOLDERS_SHARE);
  const dailyProtocolRevenue = dailyRevenue.clone(1 - HOLDERS_SHARE);

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "All swap fees paid by traders on Arctide pools, in USDC: the pool's LP fee, its protocol fee (set by the token creator) and Arctide's fixed 0.25% treasury fee, read from the Router's SwapExecuted events.",
  UserFees: "Same as Fees; every fee is paid by the trader.",
  Revenue: "Arctide's 0.25% treasury fee on every swap, plus the protocol fees of the pools whose protocol recipient is Arctide itself (the $TIDE and $DUCK pools).",
  ProtocolRevenue: "30% of Revenue, retained by Arctide.",
  HoldersRevenue: "70% of Revenue, used to buy back and burn $TIDE.",
  SupplySideRevenue: "LP fees credited to liquidity providers, plus protocol fees paid to token creators' chosen addresses.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.LP_FEES]: "Per-pool LP fee, set by the token creator, credited to liquidity providers in USDC on every swap.",
    [METRIC.CREATOR_FEES]: "Per-pool protocol fee paid to the token creator's chosen address (pools not owned by Arctide).",
    [METRIC.PROTOCOL_FEES]: "Per-pool protocol fee on the pools whose recipient is Arctide itself ($TIDE, $DUCK).",
    [TREASURY_FEE]: "Fixed 0.25% of every swap, paid to Arctide's treasury.",
  },
  UserFees: {
    [METRIC.LP_FEES]: "LP fee paid by the trader.",
    [METRIC.CREATOR_FEES]: "Creator protocol fee paid by the trader.",
    [METRIC.PROTOCOL_FEES]: "Arctide protocol fee paid by the trader.",
    [TREASURY_FEE]: "Treasury fee paid by the trader.",
  },
  Revenue: {
    [METRIC.PROTOCOL_FEES]: "Protocol fees of the Arctide-owned pools ($TIDE, $DUCK).",
    [TREASURY_FEE]: "Fixed 0.25% treasury fee.",
  },
  ProtocolRevenue: {
    [METRIC.PROTOCOL_FEES]: "30% of the Arctide-owned pools' protocol fees, retained by Arctide.",
    [TREASURY_FEE]: "30% of the treasury fee, retained by Arctide.",
  },
  HoldersRevenue: {
    [METRIC.PROTOCOL_FEES]: "70% of the Arctide-owned pools' protocol fees, used to buy back and burn $TIDE.",
    [TREASURY_FEE]: "70% of the treasury fee, used to buy back and burn $TIDE.",
  },
  SupplySideRevenue: {
    [METRIC.LP_FEES]: "LP fees credited to liquidity providers.",
    [METRIC.CREATOR_FEES]: "Protocol fees paid to token creators' chosen addresses.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ARC],
  start: "2026-09-16",
  methodology,
  breakdownMethodology,
};

export default adapter;
