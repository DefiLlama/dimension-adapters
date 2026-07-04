import { CHAIN } from "../../helpers/chains";
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { queryDuneSql } from "../../helpers/dune";

// DeFa — daily USDC inflow (capital raised) into invoice-backed real-world-credit pools.
// The on-chain TVL loggers expose a cumulative "raised" figure per chain; a daily job
// snapshots them into Dune (dune.defa_im.raised_daily: date, chain, raised_usd).
// Here we take the day-over-day increase = that day's inflow. DefiLlama accumulates it
// into cumulative volume, which is monotonic (never decreases) — the "total raised".
//
// First tracked day has no prior row, so it reports the full cumulative-to-date, making
// the accumulated total equal actual total raised.

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const query = `
    WITH daily AS (
      SELECT date, MAX(raised_usd) AS raised_usd            -- dedup re-runs: latest per day
      FROM dune.defa_im.raised_daily
      WHERE chain = '${options.chain}'
      GROUP BY date
    ),
    delta AS (
      SELECT date,
             COALESCE(raised_usd - LAG(raised_usd) OVER (ORDER BY date), raised_usd) AS daily_raised
      FROM daily
    )
    SELECT COALESCE(SUM(daily_raised), 0) AS daily_raised
    FROM delta
    WHERE date >= ${options.startTimestamp} AND date < ${options.endTimestamp}
  `;
  const rows: { daily_raised: number }[] = await queryDuneSql(options, query);
  dailyVolume.addUSDValue(Number(rows?.[0]?.daily_raised || 0));
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.STELLAR, CHAIN.STARKNET, "zigchain"],
  start: "2026-07-04",
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology: {
    Volume:
      "Daily USDC inflow (capital raised) into DeFa invoice-backed pools, read from the on-chain TVL loggers (Stellar, ZigChain, Starknet) snapshotted daily to Dune. Reported as the day-over-day increase in cumulative raised; the accumulated total equals total capital raised and is monotonic (never decreases).",
  },
};

export default adapter;
