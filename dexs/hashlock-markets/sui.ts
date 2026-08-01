import { FetchOptions, FetchResultV2 } from "../../adapters/types";
import { queryEvents } from "../../helpers/sui";
import { buildHashlockLegIndex, isSourceLeg, SUI_PACKAGE, SUI_MODULE } from "./shared";

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
  const legIndex = await buildHashlockLegIndex(options);

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

  // Volume = locked amounts whose hashlock-paired legs identify THIS leg as
  // the source (longest timelock among legs sharing the hashlock), minus
  // same-window refunds. Attributed to lock day.
  //
  // Per bheluga@DefiLlama (PR #6778, 2026-05-08): each cross-chain trade has
  // one withdraw per leg; we count only the source leg (where taker deposits /
  // maker withdraws), not both. Same-chain Sui<->Sui trades (if any) also
  // collapse to one source leg via the same rule.
  for (const [id, lock] of lockedById) {
    if (refundedIds.has(id)) continue;
    const leg = legIndex.bySuiHtlcId.get(String(id).toLowerCase());
    if (!leg) continue;
    if (!isSourceLeg(legIndex, leg)) continue;
    dailyVolume.add(normalizeCoinType(lock.coin_type), lock.amount);
  }

  return { dailyVolume };
}
