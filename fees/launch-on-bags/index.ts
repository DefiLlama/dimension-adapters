import { Dependencies, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSqlFromFile, queryDuneSql } from "../../helpers/dune";
import { FetchOptions } from "../../adapters/types";

interface IData {
  quote_mint: string;
  daily_fees: string;
  daily_protocol_revenue: string;
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const query = getSqlFromFile('helpers/queries/bags.sql', {
    tx_signer: 'BAGSB9TpGrZxQbEsrEznv5jXXdwyP6AXerN8aVRiAmcv',
    start: options.startTimestamp,
    end: options.endTimestamp
  })

  const data: IData[] = await queryDuneSql(options, query)

  const dailyFees = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  data.forEach(row => {
    dailyFees.add(row.quote_mint, row.daily_fees);
    dailyProtocolRevenue.add(row.quote_mint, row.daily_protocol_revenue);
  });

  return {
    dailyFees,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
  };
};


const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  dependencies: [Dependencies.DUNE],
  start: '2025-05-11',
  isExpensiveAdapter: true,
  methodology: {
    Fees: "Protocol fees from trading volume.",
    Revenue: "Protocol revenue from trading volume.",
  },
}

export default adapter
