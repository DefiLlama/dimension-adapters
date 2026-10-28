import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

// Data source: public Dune dataset maintained by the Magic Markets team,
// refreshed daily via the Dune API.
// Dataset: https://dune.com/data/dune.magicmarkets.data
// Dashboard: https://dune.com/magicmarkets/magicmarkets
// Columns used: snapshot_date, taker_volume_usd, total_volume_usd
// (dataset also carries matched_trades, active_traders, open_interest_usd,
// available_liquidity_usd for future dimensions)

const fetch = async (options: FetchOptions) => {
  const query = `
    SELECT
      SUM(taker_volume_usd) AS matched_volume_usd,
      SUM(total_volume_usd) AS notional_volume_usd
    FROM dune.magicmarkets.data
    WHERE CAST(snapshot_date AS DATE) = DATE '${options.dateString}'
  `;
  const data: {
    matched_volume_usd: string;
    notional_volume_usd: string;
  }[] = await queryDuneSql(options, query);

  // Fail loudly if the dataset has no row for the requested day rather than
  // silently reporting 0 volume; the daily upload should always precede this run.
  if (
    !data.length ||
    data[0].matched_volume_usd == null ||
    data[0].notional_volume_usd == null
  ) {
    throw new Error(`dune.magicmarkets.data has no rows for ${options.dateString}`);
  }

  const dailyVolume = Number(data[0].matched_volume_usd);
  const dailyNotionalVolume = Number(data[0].notional_volume_usd);
  // Guard against malformed aggregates becoming NaN and corrupting the series.
  if (!Number.isFinite(dailyVolume) || !Number.isFinite(dailyNotionalVolume)) {
    throw new Error(`dune.magicmarkets.data has invalid volume data for ${options.dateString}`);
  }

  return { dailyVolume, dailyNotionalVolume };
};

const methodology = {
  Volume:
    "USD value of stakes matched on the Magic Markets exchange each day, counted once per matched trade (taker side only). Sourced from the team-maintained public Dune dataset dune.magicmarkets.data, which is refreshed daily from production settlement records.",
  NotionalVolume:
    "Both sides of each matched trade (taker + maker stakes), i.e. exactly 2x Volume.",
};

const adapter: SimpleAdapter = {
  version: 1, // Dune-backed adapters must be version 1 (daily, not hourly)
  fetch,
  chains: [CHAIN.OFF_CHAIN],
  start: "2026-05-12",
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology,
};

export default adapter;
