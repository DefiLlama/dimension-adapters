import { FetchOptions, FetchResultV2 } from "../../adapters/types";
import { queryEvents } from "../../helpers/sui";

// Hashlock Markets Sui mainnet HTLC package.
// Published 2026-05-01. Source: contracts/sui-htlc/Published.toml
const SUI_PACKAGE =
  "0xd0f016aaec58d79c9108866b35e59412e3e95d7252464858c8141345f44bad0e";
const SUI_MODULE = "htlc";

// The Sui HTLC module emits three event types from the same module:
//   HTLCLocked   { htlc_id, sender, receiver, hashlock, timelock_ms, amount, coin_type, ... }
//   HTLCClaimed  { htlc_id, preimage, hashlock }
//   HTLCRefunded { htlc_id }
// We discriminate by inspecting the parsed JSON keys.

interface HTLCLockedEvent {
  htlc_id: string;
  amount: string;
  coin_type: string;
}

interface HTLCRefundedEvent {
  htlc_id: string;
}

function isLocked(e: any): e is HTLCLockedEvent {
  return e && typeof e.amount !== "undefined" && typeof e.coin_type !== "undefined";
}

function isRefunded(e: any): e is HTLCRefundedEvent {
  return (
    e &&
    typeof e.htlc_id !== "undefined" &&
    typeof e.amount === "undefined" &&
    typeof e.preimage === "undefined"
  );
}

function normalizeCoinType(t: string): string {
  // Sui coin types are fully-qualified strings, e.g. "0x2::sui::SUI" or
  // "0x...::usdc::USDC". The DefiLlama price feed expects either a coingecko
  // id or a chain-prefixed token. We pass through; the helper resolves it
  // against the sui price source. Strip any leading 0x normalization here.
  if (!t) return t;
  return t.startsWith("0x") ? t : `0x${t}`;
}

export async function fetchSui(options: FetchOptions): Promise<FetchResultV2> {
  const dailyVolume = options.createBalances();

  // Pull all events from the htlc module that fall in the day window.
  // queryEvents (helpers/sui.ts) walks suix_queryEvents backwards via cursor
  // and filters in-memory by options.startTimestamp / options.endTimestamp.
  const events = await queryEvents({
    eventModule: { package: SUI_PACKAGE, module: SUI_MODULE },
    options,
  });

  const lockedById = new Map<string, HTLCLockedEvent>();
  const refundedIds = new Set<string>();

  for (const ev of events) {
    if (isLocked(ev)) lockedById.set(ev.htlc_id, ev);
    else if (isRefunded(ev)) refundedIds.add(ev.htlc_id);
  }

  // Volume = all locked amounts, minus same-window refunds. Attributed to lock day.
  // Sui's HTLCClaimed event lacks amount/coin_type, so claim-day attribution is
  // not possible. Lock-day counting eliminates cross-midnight gaps entirely.
  // Edge case: HTLC locked today, refunded tomorrow → overcounted by one day.
  // Acceptable: timelocks are short (hours) and the vast majority settle.
  for (const [id, lock] of lockedById) {
    if (refundedIds.has(id)) continue;
    dailyVolume.add(normalizeCoinType(lock.coin_type), lock.amount);
  }

  return { dailyVolume };
}
