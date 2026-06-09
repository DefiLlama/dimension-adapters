import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

const fetch: any = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyVolume = options.createBalances();

  const query = `
    SELECT
      COALESCE(daily_fees_usd_sol, 0)          AS daily_fees_usd_sol,
      COALESCE(daily_solana_volume_usd, 0) AS daily_solana_volume_usd
    FROM
      dune.lab_terminal.historical_aggregates_v3
    WHERE
      snapshot_date >= CAST(from_unixtime(${options.startTimestamp}) AS DATE)
      AND snapshot_date <= CAST(from_unixtime(${options.endTimestamp}) AS DATE)
    LIMIT 1
  `;

  const res = await queryDuneSql(options, query);
  if (!res?.length) return { dailyFees };

  dailyFees.addUSDValue(res[0].daily_fees_usd_sol);
  dailyVolume.addUSDValue(res[0].daily_solana_volume_usd);

  return {
    dailyFees,
    dailyVolume,
    // dailyRevenue: dailyFees,  // skipping these for now as we are not excluding amount for referrals
    // dailyProtocolRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2025-06-29",
  dependencies: [Dependencies.DUNE],
  methodology: {
    Fees: "Trading fees paid by users in SOL",
    Volume: "Total USD volume of trades on Solana",
    // ProtocolRevenue: "Trading fees are collected by Lab Terminal",
    // Revenue: "Trading fees are collected by Lab Terminal",
  },
};

export default adapter;
