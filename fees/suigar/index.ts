import { Dependencies, SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryAllium } from "../../helpers/allium";

// Every Suigar game settles a bet by calling into the shared
// suigar::core::destroy_stake_ticket, which emits one
// suigar::core::BetResultEvent<GameType> per sub-bet (stake_amount = wagered,
// outcome_amount = paid out, both in the coin's on-chain smallest unit, no
// pre-fee deduction). On-chain the event type is always
// {core_package}::core::BetResultEvent<{game_package}::{module}::GameType>;
// we query Allium by core package + game module in the generic parameter.
//
// Game package ids below are each game's current (latest) deployed version,
// from .env.mainnet.shared (for reference when upgrading). Suigar's Move
// upgrades publish a new package id per version; Allium matches by module
// name in the event generic so all settled bets for a game are counted
// regardless of which package version was active.
//
// RPS has no mainnet package id (not live yet) and is intentionally omitted.
const CORE_PACKAGE = "0xcbb0929f21450013ebe5e86e7139f2409da2e3ed212c51126a7e6448b795a43f";

const GAME_MODULES: { name: string; package: string; module: string }[] = [
  { name: "Coinflip", package: "0x7abfa63dbc4e7e066e140798ffa2db2d8ebd33cbd81913d1092b5860c6d251a3", module: "coinflip" },
  { name: "Limbo", package: "0x83f34ce121453953168292f8c0e22e8fa8712e22f3220ecb11a73db5f5124cc1", module: "limbo" },
  { name: "Plinko", package: "0x54b7dbfafd74c1cbc512f14a4ace945831e9515126435ef4fc30a7b1557e0c5c", module: "plinko" },
  { name: "Range", package: "0x6ca66a031fd8c5393073514e132246d48a3fb85de97b91e1ab5ee2d36ab793ab", module: "range" },
  { name: "Wheel", package: "0x74014451d86099bc72f4336d261956eda55691481e09d6a7176725cf8da4194f", module: "wheel" },
  { name: "Soccer", package: "0x4d58187ab35fc6a99d503ce76542dddfc2b9fb0a45cb9a3797d6380341cdeb86", module: "soccer" },
  { name: "Keno", package: "0xa1e394690061dd856dcd4a46a47627f5ab68299e18ba4db42f91c3fa1d80011a", module: "keno" },
  { name: "PvP Coinflip", package: "0x94fe3f0f2e8c7b4b9982b22ddd787a6a33ec02ca1fe81be1ce7cf5467780e3e2", module: "pvp_coinflip" },
];

const BET_RESULT_EVENT_TYPES = GAME_MODULES.map(
  ({ module }) => `${CORE_PACKAGE}::core::BetResultEvent%::${module}::`
);

function normalizeCoinType(raw: string): string {
  const withPrefix = raw.startsWith("0x") ? raw : `0x${raw}`;
  return withPrefix.replace(/0x([0-9a-fA-F]+)/g, (_m: string, hex: string) => {
    const stripped = hex.replace(/^0+/, "") || "0";
    return stripped.length <= 1 ? `0x${stripped}` : `0x${stripped.padStart(64, "0")}`;
  });
}

interface GameEvent {
  coin_type?: { name: string };
  stake_amount?: string;
  outcome_amount?: string;
}

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const start = new Date(options.fromTimestamp * 1000).toISOString();
  const end = new Date(options.toTimestamp * 1000).toISOString();
  const typeFilter = BET_RESULT_EVENT_TYPES.map((t) => `type LIKE '${t}%'`).join(" OR ");
  const rows: { parsed_json: GameEvent }[] = await queryAllium(`
    SELECT parsed_json
    FROM sui.raw.events
    WHERE checkpoint_timestamp >= '${start}' AND checkpoint_timestamp < '${end}'
      AND (${typeFilter})
  `);

  for (const { parsed_json: ev } of rows) {
    if (ev.stake_amount === undefined || ev.outcome_amount === undefined || !ev.coin_type) continue;
    const coinType = normalizeCoinType(ev.coin_type.name);
    const stake = Number(ev.stake_amount);
    const outcome = Number(ev.outcome_amount);

    dailyVolume.add(coinType, stake);
    // House win for this bet — negative when the payout exceeds the
    // stake, which nets out fine over a period but can make a single
    // day's total negative.
    const houseWin = stake - outcome;
    dailyFees.add(coinType, houseWin, "Casino house edge");
    dailySupplySideRevenue.add(coinType, houseWin, "Casino house edge");
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: 0,
    dailySupplySideRevenue,
  };
};

const breakdownMethodology = {
  Fees: {
    "Casino house edge":
      "Stake minus payout on every settled bet across all live Suigar games (Coinflip, Limbo, Plinko, Range, Wheel, Soccer, Keno, PvP Coinflip), read from each game's suigar::core::BetResultEvent. Negative on days the house pays out more than it collects.",
  },
  SupplySideRevenue: {
    "Casino house edge": "SweetHouse LPs (private, public, rakeback and whitelist pools) are the counterparty to every bet and bear its house edge as pool P&L.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.SUI],
  start: "2026-04-08",
  allowNegativeValue: true,
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  methodology: {
    Volume: "Total amount wagered across all live Suigar casino games (Coinflip, Limbo, Plinko, Range, Wheel, Soccer, Keno, PvP Coinflip), summed from each settled bet's stake_amount on suigar::core::BetResultEvent.",
    Fees: "House edge realized on settled bets: stake minus payout, summed across all games.",
    UserFees: "The net amount players lose to the house on settled bets.",
    Revenue: "No revenue is generated from the casino, all the casino house edge are paid to the LPs.",
    SupplySideRevenue: "100% of fees accrue to SweetHouse LPs who back the bankroll across its private, public, rakeback and whitelist pools.",
  },
  breakdownMethodology,
};

export default adapter;
