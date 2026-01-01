import { CHAIN } from "../../helpers/chains";
import {
  Dependencies,
  FetchOptions,
  SimpleAdapter,
} from "../../adapters/types";
import { queryDuneSql } from "../../helpers/dune";

// DFlow Aggregator v1 (until July 3, 2024)
const DFLOW_V1 = "DF1ow1bqef673cziBbmHDcJ9mfy3oy9KqxEc6kCTHocs";

// DFlow Aggregator v2 (until December 13, 2024)
const DFLOW_V2 = "DF1ow2u6srpvhAXjR3wx6LUh2UTtpbLJSCfD2eBeSveG";

// DFlow Aggregator v3 (until April 7, 2025)
const DFLOW_V3 = "DF1ow3DqMj3HvTj8i8J9yM2hE9hCrLLXpdbaKZu4ZPnz";

// DFlow Aggregator v4 (current)
const DFLOW_V4 = "DF1ow4tspfHX9JwWJsAb9epbkA8hmpSEAtxXy1V27QBH";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const data = await queryDuneSql(
    options,
    `
    SELECT
      SUM(fee_usd) AS fees
    FROM dex_solana.trades
    WHERE trade_source IN ('${DFLOW_V1}', '${DFLOW_V2}', '${DFLOW_V3}', '${DFLOW_V4}')
    AND block_time >= from_unixtime(${options.startTimestamp}) AND block_time < from_unixtime(${options.endTimestamp})
  `
  );

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  if (data[0] && data[0].fees) {
    dailyFees.addUSDValue(data[0].fees);
    dailyRevenue.addUSDValue(data[0].fees);
  }

  return {
    dailyFees,
    dailyRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  start: "2024-01-01",
  chains: [CHAIN.SOLANA],
  dependencies: [Dependencies.DUNE],
  methodology: {
    Fees: "Transaction fees collected by DFlow aggregator from trades routed through their protocol.",
    Revenue: "All fees collected by the DFlow protocol.",
  },
};

export default adapter;
