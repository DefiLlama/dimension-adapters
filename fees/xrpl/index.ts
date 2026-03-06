import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

const fetch = async (_a: any, _b: any, options:FetchOptions) => {
  const query = `
    SELECT
      SUM(CAST(fee AS DOUBLE)/1e6) AS "daily_fees"
    FROM xrpl.transactions
    WHERE
      result = 'tesSUCCESS'
      AND _event_created_at >= from_unixtime(${options.startTimestamp})
      AND _event_created_at <= from_unixtime(${options.endTimestamp})
  `
  const res = await queryDuneSql(options, query);
  const dailyFees = options.createBalances();
  console.log(res);
  dailyFees.addCGToken("ripple", res[0].daily_fees);
  return { dailyFees, dailyRevenue: dailyFees }
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.RIPPLE],
  start: '2023-12-16',
  methodology: {
    Fees: 'Fees paid by users for transactions on the XRPL',
    Revenue: 'all fees are burned'
  }
}

export default adapter;
