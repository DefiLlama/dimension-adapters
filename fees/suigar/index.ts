import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryEvents } from "../../helpers/sui";

// Every Suigar game settles a bet by calling into the shared
// suigar::core::destroy_stake_ticket, which emits one
// suigar::core::BetResultEvent<GameType> per sub-bet (stake_amount = wagered,
// outcome_amount = paid out, both in the coin's on-chain smallest unit, no
// pre-fee deduction). Sui's event index resolves this generic event's module
// filter against the settling game's own module (not core's), so we query
// per game package rather than once against the shared core module.
//
// Mainnet package ids below are each game's current (latest) deployed
// version, from .env.mainnet.shared. Suigar's Move upgrades publish a new
// package id per version, and this adapter only sees bets settled under the
// package ids listed here going forward — it does not backfill bets settled
// under a game's earlier package version(s).
//
// RPS has no mainnet package id (not live yet) and is intentionally omitted.
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
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const eventOptions = {
    startTimestamp: options.startTimestamp,
    endTimestamp: options.endTimestamp,
  };

  const perGameEvents = await Promise.all(
    GAME_MODULES.map(({ package: pkg, module }) =>
      queryEvents<GameEvent>({
        eventModule: { package: pkg, module },
        options: eventOptions,
      })
    )
  );

  for (const events of perGameEvents) {
    for (const ev of events) {
      // Each game's module also surfaces sibling events emitted in the same
      // settlement transaction (e.g. sweethouse::LogPoolsValuesEvent) and, on
      // wins, a fieldless DummyEvent — only BetResultEvent carries both a
      // stake and an outcome amount, so anything else is skipped here.
      if (ev.stake_amount === undefined || ev.outcome_amount === undefined || !ev.coin_type) continue;
      const coinType = normalizeCoinType(ev.coin_type.name);
      const stake = Number(ev.stake_amount);
      const outcome = Number(ev.outcome_amount);

      dailyVolume.add(coinType, stake, "Wagered");
      // House win for this bet — negative when the payout exceeds the
      // stake, which nets out fine over a period but can make a single
      // day's total negative.
      const houseWin = stake - outcome;
      dailyFees.add(coinType, houseWin, "Casino house edge");
      dailyRevenue.add(coinType, houseWin, "Casino house edge");
      dailySupplySideRevenue.add(coinType, houseWin, "Casino house edge");
    }
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
  };
};

const breakdownMethodology = {
  Fees: {
    "Casino house edge":
      "Stake minus payout on every settled bet across all live Suigar games (Coinflip, Limbo, Plinko, Range, Wheel, Soccer, Keno, PvP Coinflip), read from each game's suigar::core::BetResultEvent. Negative on days the house pays out more than it collects.",
  },
  Revenue: {
    "Casino house edge": "All house-edge losses flow directly into the SweetHouse bankroll shared by LPs; there is no separate team/treasury cut.",
  },
  SupplySideRevenue: {
    "Casino house edge": "SweetHouse LPs (private, public, rakeback and whitelist pools) are the counterparty to every bet and bear its house edge as pool P&L.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.SUI],
  start: "2026-09-04",
  allowNegativeValue: true,
  methodology: {
    Volume: "Total amount wagered across all live Suigar casino games (Coinflip, Limbo, Plinko, Range, Wheel, Soccer, Keno, PvP Coinflip), summed from each settled bet's stake_amount on suigar::core::BetResultEvent.",
    Fees: "House edge realized on settled bets: stake minus payout, summed across all games.",
    UserFees: "The net amount players lose to the house on settled bets.",
    Revenue: "100% of fees are protocol revenue: house-edge losses flow directly into the SweetHouse bankroll (shared with LPs) with no separate team/treasury cut.",
    SupplySideRevenue: "100% of fees accrue to SweetHouse LPs who back the bankroll across its private, public, rakeback and whitelist pools.",
  },
  breakdownMethodology,
};

export default adapter;
