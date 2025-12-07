import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

const SANTA_BROWSER_ADDRESS = "0xa9bb3bd182a7b4d632c24299cbd0435450aca66a2180c1617ee823a66ec37266";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();

  const sql = `
    SELECT
      SUM(CAST(REGEXP_EXTRACT(JSON_EXTRACT_SCALAR(data, '$.metadata'), 'Amount ([0-9.]+) USD', 1) AS DOUBLE)) AS total_amount_usd
    FROM aptos.events
    WHERE guid_account_address = ${SANTA_BROWSER_ADDRESS}
      AND CAST(JSON_EXTRACT_SCALAR(data, '$.event_type') AS DOUBLE) = 2
      AND TIME_RANGE
  `;
  const result = await queryDuneSql(options, sql);
  dailyFees.addUSDValue(Number(result[0].total_amount_usd));

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Fees: "All purchase amounts paid by users through Santa Browser, tracked via on-chain Aptos events.",
  Revenue: "Total revenue from user purchases via the Santa Browser platform.",
  ProtocolRevenue: "Protocol revenue from Santa Browser purchases.",
  UserFees: "Fees paid by users for purchases through Santa Browser.",
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.APTOS],
  start: "2025-01-01",
  methodology,
  isExpensiveAdapter: true,
  dependencies: [Dependencies.DUNE],
};

export default adapter;
