import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpPost } from "../utils/fetchURL";

// Hyperliquid AQAv2 ("aligned quote asset") reserve yield.
//
// Docs: https://hyperliquid.gitbook.io/hyperliquid-docs/hypercore/aligned-quote-assets
//   "Under AQAv2, stablecoin deployers share approximately 90% of cost-adjusted reserve
//    yield revenue on their Hyperliquid supply with the protocol."
//   "Reserve yield revenue accrues in 30 day intervals based on the block on each UTC
//    date, automatically sent to the Assistance Fund 8 days after each interval completes."
//   "... the system interest address `0x50...00 + {token_index}` ..."
//
// The deployer funds the system interest address and the protocol transfers what is owed
// from it to the Assistance Fund at 00:00 UTC. This adapter counts that transfer, i.e. the
// yield is recorded on the day it is DELIVERED to the Assistance Fund, not while it accrues.
const HL_INFO_API = "https://api.hyperliquid.xyz/info";

// System interest address = 0x50...00 + {token_index}. USDC is spot token index 0
// ({ type: "spotMeta" } on the info API), so the address is 0x50 followed by zeros.
const SYSTEM_INTEREST_ADDRESS = "0x5000000000000000000000000000000000000000";

// Assistance Fund system address: the same address the perp and spot adapters' buybacks are held at.
const ASSISTANCE_FUND = "0xfefefefefefefefefefefefefefefefefefefefe";

// First payment, for reference when rebuilding this adapter without the API:
//   2026-10-03T02:43:10Z  deployer -> system interest address, 14,580,777.21 USDC
//                         tx 0x4f7fde96a716741750f90445b88286020153007c421992e9f34889e9661a4e01
//   2026-10-03T00:00:00Z  system interest address -> Assistance Fund, 2.00 USDC
//   2026-10-04T00:00:00Z  system interest address -> Assistance Fund, 14,580,774.6853 USDC
// The two transfers to the Assistance Fund are protocol actions: the ledger reports an
// all-zero hash for them, so rows are deduplicated on (time, amount), never on hash.
const LABEL = "AQAv2 Reserve Yield";

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const startMs = options.startTimestamp * 1000;
  const endMs = options.endTimestamp * 1000;

  // a finite deadline, so a response that never completes fails the run instead of stalling it
  const ledger = await httpPost(HL_INFO_API, {
    type: "userNonFundingLedgerUpdates",
    user: SYSTEM_INTEREST_ADDRESS,
    startTime: startMs,
    endTime: endMs,
  }, { timeout: 30_000 });
  // An empty window is an empty array. Anything else is not an answer, and must not be stored as $0.
  if (!Array.isArray(ledger)) throw new Error(`Hyperliquid userNonFundingLedgerUpdates returned a non-array body for ${SYSTEM_INTEREST_ADDRESS}`);

  const seen = new Set<string>();
  let deliveredUsdc = 0;
  for (const row of ledger) {
    const delta = row?.delta;
    if (!delta || (delta.type !== "send" && delta.type !== "spotTransfer")) continue;
    if (delta.token !== "USDC") continue;
    // direction is checked, not assumed: the same ledger carries the deployer's credits IN
    if (String(delta.user).toLowerCase() !== SYSTEM_INTEREST_ADDRESS) continue;
    if (String(delta.destination).toLowerCase() !== ASSISTANCE_FUND) continue;
    // half-open window, so a transfer at exactly 00:00:00 UTC belongs to the day it starts
    if (row.time < startMs || row.time >= endMs) continue;
    const key = `${row.time}:${delta.amount}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const amount = Number(delta.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error(`Unreadable USDC amount in Hyperliquid ledger row at ${row.time}: ${delta.amount}`);
    deliveredUsdc += amount;
  }

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  dailyFees.addCGToken("usd-coin", deliveredUsdc, LABEL);
  dailyRevenue.addCGToken("usd-coin", deliveredUsdc, LABEL);
  dailyHoldersRevenue.addCGToken("usd-coin", deliveredUsdc, LABEL);

  return {
    dailyFees,
    dailyRevenue,
    dailyHoldersRevenue,
    dailyProtocolRevenue: 0,
  };
};

const methodology = {
  Fees: "Reserve yield on aligned stablecoin (AQAv2) reserves that is shared with the Hyperliquid protocol: approximately 90% of the cost-adjusted reserve yield on the stablecoin's Hyperliquid supply, per Hyperliquid docs. It is paid every 30 days and recorded on the day it is delivered to the Assistance Fund. The stablecoin deployer's own share is excluded.",
  Revenue: "All reserve yield shared with the protocol is sent to the Assistance Fund.",
  ProtocolRevenue: "Protocol doesn't keep any of it.",
  HoldersRevenue: "All reserve yield shared with the protocol is sent to the Assistance Fund, which buys HYPE.",
};

const breakdownMethodology = {
  Fees: {
    [LABEL]: "USDC transferred from the AQAv2 system interest address to the Assistance Fund: the protocol's share of aligned stablecoin reserve yield for a completed 30 day interval.",
  },
  Revenue: {
    [LABEL]: "The same transfers. All of the protocol's share goes to the Assistance Fund.",
  },
  HoldersRevenue: {
    [LABEL]: "The same transfers, received by the Assistance Fund, which buys HYPE.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.HYPERLIQUID],
  start: "2026-10-03",
  methodology,
  breakdownMethodology,
};

export default adapter;
