import { FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSqlFromFile, queryDuneSql } from "../../helpers/dune";

const fetch = async (_a: any, _b: any, options: FetchOptions): Promise<FetchResultV2> => {
  // https://dune.com/queries/4751411
  const sql = getSqlFromFile("helpers/queries/jupiter-perpetual.sql", {
    start: options.startTimestamp,
    end: options.endTimestamp
  });
  const data: any[] = (await queryDuneSql(options, sql));
  const dailyFees = data[0].total_fees;
  return {
    dailyFees,
    dailyRevenue: `${dailyFees * (25 / 100)}`,
    dailyHoldersRevenue: `${(dailyFees * (25 / 100)) * (50 / 100)}`,
    dailyProtocolRevenue: `${(dailyFees * (25 / 100)) * (50 / 100)}`,
    dailySupplySideRevenue: `${dailyFees * (75 / 100)}`,
  }
};

const adapter = {
  version: 1,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      runAtCurrTime: true,
      start: '2024-01-23',
    },
  },
  isExpensiveAdapter: true,
};
export default adapter;

