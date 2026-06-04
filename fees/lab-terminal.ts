import ADDRESSES from "../helpers/coreAssets.json";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

const fetch: any = async (_: any, _1: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyVolume = options.createBalances();

  const query = `
    SELECT
      COALESCE(daily_fees_sol, 0)          AS daily_fees_sol,
      COALESCE(daily_solana_volume_usd, 0) AS daily_solana_volume_usd
    FROM
      dune.lab_terminal.historical_aggregates_v3
    WHERE
      snapshot_date = CAST(from_unixtime(${options.startTimestamp}) AS DATE)
    LIMIT 1
  `;

  const res = await queryDuneSql(options, query);
  if (!res?.length) return { dailyFees, dailyVolume };

  dailyFees.add(ADDRESSES.solana.SOL, res[0].daily_fees_sol * 1e9);
  dailyVolume.add(ADDRESSES.solana.USDC, res[0].daily_solana_volume_usd * 1e6);

  return { dailyFees, dailyVolume };
};

const adapter: SimpleAdapter = {
  chains: [CHAIN.SOLANA],
  fetch,
  start: "2025-06-29",
  isExpensiveAdapter: true,
  methodology: {
    Fees: "Trading fees paid by users in SOL",
    Volume: "Total USD volume of trades on Solana",
  },
};

export default adapter;
