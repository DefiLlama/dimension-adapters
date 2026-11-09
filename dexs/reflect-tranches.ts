import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryAllium } from "../helpers/allium";

// Reflect Tranches markets. Each market is a junior market pool + the senior market it backstops,
// over a yield-bearing stablecoin. Add a new market by appending an entry here.
const MARKETS = [
  {
    underlying: "AvZZF1YaZDziPY2RCK4oJrRVrbN3mTD9NL24hPeaZeUj", // syrupUSDC
    senior: "FD4YydhzPpSmXwnHsX1oJBE4er4m9mg4ezaBN9cXgQbz", // senior market account (owns the senior vault)
    junior: "5dVxqyK1m3f4ZiPjZEhwgTLH5wZrU79d4Bsd67pgQk46", // junior market account (owns the pool reserve)
  },
  {
    underlying: "HnnGv3HrSqjRpgdFmx7vQGjntNEoex1SU4e9Lxcxuihz", // eHYUSD
    senior: "DHEFndu3LxDkuQSzxz5HQ1N2UEm2c6evRzRSsyLL8S7i",
    junior: "GtMx2AbDG4HgSwD4biU3PB73fWDkX8kYx1yX44RRZvLq",
  },
];

// Volume = daily user deposits + redemptions of each market's underlying, moved in/out of that
// market's senior vault and junior pool. Protocol-internal transfers between the two accounts
// (yield routing / slashing) are excluded via the XOR condition so only real user flow counts.
const fetch: any = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  const marketConds = MARKETS.map((m) => {
    const accounts = `'${m.senior}','${m.junior}'`;
    return `(mint = '${m.underlying}' AND ((to_address IN (${accounts}) AND from_address NOT IN (${accounts})) OR (from_address IN (${accounts}) AND to_address NOT IN (${accounts}))))`;
  }).join(" OR ");

  const rows = await queryAllium(`
    SELECT mint, SUM(raw_amount) AS amount
    FROM solana.assets.transfers
    WHERE block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
      AND block_timestamp <  TO_TIMESTAMP_NTZ(${options.endTimestamp})
      AND (${marketConds})
    GROUP BY mint
  `);

  for (const row of rows || []) dailyVolume.add(row.mint, row.amount || 0);
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  isExpensiveAdapter: true,
  dependencies: [Dependencies.ALLIUM],
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: "2026-08-26", // tranche launch
    },
  },
  methodology: {
    Volume:
      "Daily user deposits and redemptions of each Reflect Tranches market's underlying yield-bearing stablecoin (e.g. syrupUSDC, eHYUSD), moved in/out of the senior tranche and junior tranche. Protocol-internal transfers between the two tranche accounts (yield routing, slashing) are excluded.",
  },
};

export default adapter;
