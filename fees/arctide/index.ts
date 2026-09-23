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

const toUsdc = (wei: bigint): bigint => wei / 10n ** 12n; // native 18 decimals -> USDC 6 decimals

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const logs = await options.getLogs({ target: ROUTER, eventAbi: SWAP_EXECUTED });
  for (const log of logs) {
    const lp = BigInt(log.lpFeeNative);
    const protocol = BigInt(log.protocolFeeNative);
    const treasury = BigInt(log.treasuryFeeNative);

    dailyFees.add(USDC, toUsdc(lp + protocol + treasury));
    dailySupplySideRevenue.add(USDC, toUsdc(lp));
    dailyRevenue.add(USDC, toUsdc(treasury));

    const recipient = String(log.protocolRecipient).toLowerCase();
    const arctideOwned =
      recipient === String(log.treasuryRecipient).toLowerCase() || ARCTIDE_PROTOCOL_RECIPIENTS.has(recipient);
    if (arctideOwned) dailyRevenue.add(USDC, toUsdc(protocol));
    else dailySupplySideRevenue.add(USDC, toUsdc(protocol));
  }

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

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ARC],
  start: "2026-09-16",
  methodology: {
    Fees: "All swap fees paid by traders on Arctide pools, in USDC: the pool's LP fee, its protocol fee (set by the token creator) and Arctide's fixed 0.25% treasury fee, read from the Router's SwapExecuted events.",
    UserFees: "Same as Fees; every fee is paid by the trader.",
    Revenue: "Arctide's 0.25% treasury fee on every swap, plus protocol fees on pools whose protocol recipient is Arctide itself (the $TIDE pool).",
    ProtocolRevenue: "30% of Revenue, retained by Arctide.",
    HoldersRevenue: "70% of Revenue, used to buy back and burn $TIDE.",
    SupplySideRevenue: "LP fees credited to liquidity providers, plus protocol fees paid to token creators' chosen addresses.",
  },
};

export default adapter;
