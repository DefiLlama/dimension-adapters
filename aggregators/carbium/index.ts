import { CHAIN } from "../../helpers/chains";
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { queryDuneSql } from "../../helpers/dune";

// The Carbium Router is the on-chain program every trade built by Carbium's quote API calls at the top level; it then
// calls each venue in the route. dex_solana.trades tags every decoded venue hop it calls with trade_source = the router.
// Program id: https://carbium.sh/skill/quote.md. Sample trade: 3hGYCSPKouXsvF6iN1VHikb7rmzvMAGNHxVvcFyVCTjCHqtD4dJmHkf9w1FpsHDZe978Uw7NdxYn95ejRGLceZc4
// (outer instruction 5 is the router, which calls an Orca Whirlpool).
const CARBIUM_ROUTER = "cqXpiki8fwAWY72xtzqPLmstzf3MZ4kjJBhRatZrWMs";

// One trade is one router instruction (tx_id, outer_instruction_index). A route can split a hop across several pools and
// chain several hops, so a trade is valued once, at the token it starts from: the hops that sell the mint its first hop
// sells are summed (split legs in full), and the later hops of the route are left out.
const fetch = async (options: FetchOptions) => {
  const tenHoursAgo = Date.now() - 10 * 60 * 60 * 1000;
  if (options.toTimestamp * 1000 > tenHoursAgo) {
    throw new Error("End timestamp is less than 10 hours ago, skipping due to dune indexing delay");
  }

  const data = await queryDuneSql(
    options,
    `
    WITH hops AS (
      SELECT tx_id, outer_instruction_index AS oi, inner_instruction_index AS ii, token_sold_mint_address AS sold, amount_usd
      FROM dex_solana.trades
      WHERE TIME_RANGE
        AND trade_source = '${CARBIUM_ROUTER}'
    ),
    entry AS (
      SELECT tx_id, oi, min_by(sold, ii) AS mint
      FROM hops
      GROUP BY 1, 2
    ),
    trades AS (
      SELECT h.tx_id, h.oi, SUM(h.amount_usd) AS volume
      FROM hops h
      JOIN entry e ON e.tx_id = h.tx_id AND e.oi = h.oi AND e.mint = h.sold
      GROUP BY 1, 2
    )
    SELECT COUNT(*) AS trades, SUM(volume) AS volume
    FROM trades
  `,
  );

  // One row always comes back. A day with no router trade is a real 0 (the router has quiet days; the 10-hour wait
  // above covers Dune's indexing lag). Trades that come back with no USD value at all throw.
  const row = data[0];
  if (!row || row.trades == null) throw new Error(`Dune query failed: ${JSON.stringify(data)}`);
  if (row.trades > 0 && row.volume == null) throw new Error(`Carbium Router trades with no USD value: ${JSON.stringify(row)}`);
  return { dailyVolume: row.volume ?? 0 };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  // The day of the router's first trade in dex_solana.trades.
  start: "2026-06-21",
  chains: [CHAIN.SOLANA],
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology: {
    Volume:
      "USD value of trades routed through the Carbium Router on Solana, each counted once at the token it starts from. " +
      "Hops on venues Dune does not decode and tokens with no USD price are not counted, so it can sit slightly under the router's full volume.",
  },
};

export default adapter;
