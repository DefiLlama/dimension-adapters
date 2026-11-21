import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

const fetch: any = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyVolume = options.createBalances();

  const query = `
    SELECT
      daily_fees_usd_sol,
      daily_solana_volume_usd
    FROM
      dune.lab_terminal.historical_aggregates_v3
    WHERE
      snapshot_date = CAST(from_unixtime(${options.toTimestamp}) AS DATE)
    LIMIT 1
  `;

  const res = await queryDuneSql(options, query);
  // The adapter can't tell a row not yet written from a day with no fees, so a missing row or a null value throws.
  if (!res?.length || res[0].daily_fees_usd_sol == null || res[0].daily_solana_volume_usd == null)
    throw new Error(`Missing dune.lab_terminal.historical_aggregates_v3 data for ${options.dateString}`);

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
  version: 1,
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
