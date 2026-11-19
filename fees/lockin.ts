import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import fetchURL from "../utils/fetchURL";

/**
 * lockin — Telegram trading app for memecoins, tokenized stocks and perps.
 *
 * Website: https://lockin.cash/
 * Twitter: https://x.com/tradeonlockin
 * Telegram mini app: https://t.me/tradeonlockinbot/app
 *
 * Spot swaps routed through lockin pay a platform fee, taken in the swap's
 * input asset and sent to lockin's fee wallets:
 *   - 1% standard (100 bps)
 *   - 0.9% for verified traders (>$100k lifetime verified volume)
 *   - 0.1% for TopBlast v2 / Groypad bonding-curve coins on TON
 *   TON  - UQDCfdwTj85G3ypmkz-G5Cy6YpfhhB-vO1dQTMJNwWTv4-5e
 *   SOL  - 3aVhBP1hvQuMRY7ciLBxDa36BTgadqW9aj1x3wDaN9Ws
 *   EVM  - 0xe1BA8be268f91c011040aC2b44EfC9201A52D988
 *
 * The API returns, per chain and [start, end) unix window, the USD notional of
 * swaps whose transaction lockin verified on-chain, the fee taken (measured
 * on-chain where a referral/copy share recorded it, else the tier above) and
 * the referral / copy-trade shares paid out of that fee.
 *
 * Perps (Hyperliquid builder code) are tracked separately in `fees/lockin-perps.ts`.
 */
const API = "https://npwofniytuzvjedgutgo.supabase.co/functions/v1/defillama";

const LABELS = {
  REFERRAL_PAYOUTS: "Referral Payouts",
} as const;

interface ChainStats {
  volume: number;
  fees: number;
  referralPayouts: number;
  revenue: number;
}

// The API keys chains by DefiLlama slug (HyperEVM = CHAIN.HYPERLIQUID).
const chainConfig: Record<string, { start: string }> = {
  [CHAIN.TON]: { start: "2026-08-18" },
  [CHAIN.SOLANA]: { start: "2026-08-19" },
  [CHAIN.BSC]: { start: "2026-08-19" },
  [CHAIN.ROBINHOOD]: { start: "2026-08-23" },
  [CHAIN.BASE]: { start: "2026-08-28" },
  [CHAIN.HYPERLIQUID]: { start: "2026-08-30" },
  [CHAIN.ARC]: { start: "2026-09-16" },
  [CHAIN.INK]: { start: "2026-09-04" },
  [CHAIN.TEMPO]: { start: "2026-08-22" },
  // Avalanche is live in the app but has no swaps yet; add CHAIN.AVAX once it does.
};

const fetch = async (options: FetchOptions) => {
  const url = `${API}?start=${options.startTimestamp}&end=${options.endTimestamp}&chain=${options.chain}`;
  const res: { chains: Record<string, ChainStats> } = await fetchURL(url);
  const stats = res.chains?.[options.chain];
  if (!stats) throw new Error(`lockin: no stats for ${options.chain}`);

  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  dailyVolume.addUSDValue(stats.volume);
  dailyFees.addUSDValue(stats.fees, METRIC.TRADING_FEES);
  dailyRevenue.addUSDValue(stats.revenue, METRIC.TRADING_FEES);
  dailySupplySideRevenue.addUSDValue(stats.referralPayouts, LABELS.REFERRAL_PAYOUTS);

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue: 0,
  };
};

const methodology = {
  Volume: "USD notional of spot swaps executed through lockin whose transaction lockin verified on-chain.",
  Fees: "Platform fee on every swap: 1% standard, 0.9% for verified traders, 0.1% on TopBlast v2 / Groypad coins on TON.",
  UserFees: "Users pay the platform fee on each swap, on top of underlying DEX/router fees.",
  Revenue: "Platform fees minus referral and copy-trade shares paid out of them.",
  ProtocolRevenue: "Platform fees minus referral and copy-trade shares, kept in lockin's fee wallets.",
  SupplySideRevenue: "Referral and copy-trade shares paid to inviters and copied traders out of the platform fee.",
  HoldersRevenue: "No fees are distributed to token holders.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: "Platform fee (1% / 0.9% / 0.1% tiers) charged on spot swaps routed through lockin.",
  },
  UserFees: {
    [METRIC.TRADING_FEES]: "Platform fee paid by users on each swap.",
  },
  Revenue: {
    [METRIC.TRADING_FEES]: "Platform fees kept by lockin after referral and copy-trade shares.",
  },
  ProtocolRevenue: {
    [METRIC.TRADING_FEES]: "Platform fees kept by lockin after referral and copy-trade shares.",
  },
  SupplySideRevenue: {
    [LABELS.REFERRAL_PAYOUTS]: "Referral and copy-trade shares paid out of the platform fee.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  methodology,
  breakdownMethodology,
};

export default adapter;
