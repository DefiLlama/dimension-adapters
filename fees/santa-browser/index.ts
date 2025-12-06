import {
  Dependencies,
  FetchOptions,
  FetchResult,
  SimpleAdapter,
} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

const SANTA_BROWSER_ADDRESS =
  "0xa9bb3bd182a7b4d632c24299cbd0435450aca66a2180c1617ee823a66ec37266";

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const dailyFees = options.createBalances();

  const sql = `
    SELECT
      SUM(CAST(REGEXP_EXTRACT(JSON_EXTRACT_SCALAR(data, '$.metadata'), 'Amount ([0-9.]+) USD', 1) AS DOUBLE)) AS total_amount_usd
    FROM aptos.events
    WHERE guid_account_address = ${SANTA_BROWSER_ADDRESS}
      AND CAST(JSON_EXTRACT_SCALAR(data, '$.event_type') AS DOUBLE) = 2
      AND block_time >= from_unixtime(${options.startTimestamp})
      AND block_time < from_unixtime(${options.endTimestamp})
  `;
  const result = await queryDuneSql(options, sql);

  if (result && result.length > 0 && result[0].total_amount_usd) {
    const usdAmount = result[0].total_amount_usd;
    dailyFees.addCGToken("usd-coin", usdAmount);
  }
  const dailyRevenue = dailyFees.clone();
  const dailyProtocolRevenue = dailyFees.clone();
  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
  };
};

const methodology = {
  Fees: "All purchase amounts paid by users through Santa Browser, tracked via on-chain Aptos events.",
  Revenue: "Total revenue from user purchases via the Santa Browser platform.",
  ProtocolRevenue: "Protocol revenue from Santa Browser purchases.",
  UserFees: "Fees paid by users for purchases through Santa Browser.",
};

const adapter: SimpleAdapter = {
  version: 2,
  isExpensiveAdapter: true,
  dependencies: [Dependencies.DUNE],
  adapter: {
    [CHAIN.APTOS]: {
      fetch,
      start: "2025-01-01",
    },
  },
  methodology,
};

export default adapter;
