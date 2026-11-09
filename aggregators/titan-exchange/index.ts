import { CHAIN } from "../../helpers/chains";
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { queryDuneSql } from "../../helpers/dune";

const TITAN_PROGRAM = "T1TANpTeScyeqVzzgNViGDNrkQ6qHz9KrSBS4aNXvGT";

const fetch = async (options: FetchOptions) => {
  const tenHoursAgo = Date.now() - 10 * 60 * 60 * 1000;
  if (options.toTimestamp * 1000 > tenHoursAgo) {
    throw new Error("End timestamp is less than 10 hours ago, skipping due to dune indexing delay");
  }

  const data = await queryDuneSql(
    options,
    `
    SELECT
      COALESCE(SUM(amount_usd), 0) AS volume
    FROM dex_solana.trades
    WHERE TIME_RANGE
      AND trade_source = '${TITAN_PROGRAM}'
  `,
  );

  const row = data[0];
  if (!row) throw new Error(`Dune query failed: ${JSON.stringify(data)}`);
  return { dailyVolume: row.volume };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  start: "2025-09-18",
  chains: [CHAIN.SOLANA],
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology: {
    Volume:
      "USD volume of swaps routed through Titan Exchange on Solana, sourced from dex_solana.trades where trade_source is the Titan program.",
  },
};

export default adapter;
