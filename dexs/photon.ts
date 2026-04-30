import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const data = await queryDuneSql(options, `
    SELECT
      COALESCE(SUM(amount_usd), 0) AS daily_volume
    FROM dex_solana.trades
    WHERE TIME_RANGE
      AND tx_id IN (
        SELECT DISTINCT tx_id
        FROM solana.account_activity
        WHERE address = 'AVUCZyuT35YSuj4RH7fwiyPu82Djn2Hfg7y2ND2XcnZH'
          AND TIME_RANGE
      )
  `);

  const dailyVolume = options.createBalances();
  dailyVolume.addUSDValue(data[0].daily_volume);
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: "2024-01-08",
    },
  },
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
};

export default adapter;
