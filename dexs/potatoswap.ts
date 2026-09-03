import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniV2LogAdapter } from "../helpers/uniswap";

// Labels kept identical to what getUniV2LogAdapter itself emits, so the
// breakdown stays consistent for anyone relying on these label strings.
const LABELS = {
  SwapFees: 'Token Swap Fees',
  TradingFees: 'Trading fees',
  ProtocolFees: 'Protocol fees',
  LPFees: 'LP fees',
  TokenholderFees: 'Tokenholder fees',
}

// PotatoSwap's own stats API (v3.potatoswap.finance/api/pool/list-all) used to
// power a "recent day" fast path here, but its 24h volume/fee fields have been
// stuck at 0 since ~2026-05-07 while the pools themselves stay live (TVL
// current, real on-chain swap activity) - it was a silent-zero, not a dead
// endpoint. The on-chain log adapter below already handles every day
// (it's what powered the correct historical backfill) - use it unconditionally.
//
// `fees`/`stableFees` are both set explicitly to PotatoSwap's documented flat
// 0.25% - the helper's own default is 0.30% (Uniswap V2's rate), which would
// silently overstate every fee/revenue dimension by 20%.
const fetch = getUniV2LogAdapter({ factory: '0x630db8e822805c82ca40a54dae02dd5ac31f7fcf', fees: 0.0025, stableFees: 0.0025, userFeesRatio: 1, revenueRatio: 8 / 25, protocolRevenueRatio: 0, holdersRevenueRatio: 8 / 25 })

const methodology = {
  Fees: "PotatoSwap charges a 0.25% swap fee on v2 pools.",
  UserFees: "Users pay a 0.25% swap fee per trade.",
  Revenue: "0.08% of swap volume (the non-LP share) is distributed to vePOT holders.",
  SupplySideRevenue:
    "Liquidity providers receive 0.17% of swap volume.",
  HoldersRevenue:
    "0.08% of swap volume is distributed to vePOT holders.",
  ProtocolRevenue:
    "The protocol does not retain a direct fee share.",
};

const breakdownMethodology = {
  Fees: {
    [LABELS.SwapFees]: "0.25% swap fee paid by users on PotatoSwap v2 pools.",
  },
  UserFees: {
    [LABELS.TradingFees]: "0.25% swap fee paid by users per trade.",
  },
  Revenue: {
    [LABELS.ProtocolFees]: "0.08% of swap volume (non-LP share) going to vePOT holders.",
  },
  SupplySideRevenue: {
    [LABELS.LPFees]: "0.17% of swap volume distributed to liquidity providers.",
  },
  HoldersRevenue: {
    [LABELS.TokenholderFees]: "0.08% of swap volume distributed to vePOT holders.",
  },
};

const adapter: SimpleAdapter = {
  // v2: fetch is now exclusively on-chain event logs (no daily-aggregate API
  // dependency), matching this repo's version-2 criteria.
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.XLAYER],
  start: '2024-04-16',
  methodology,
  breakdownMethodology,
};

export default adapter;
