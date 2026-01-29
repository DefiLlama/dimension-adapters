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
  doublecounted: true,
  methodology: {
    Fees: "Total trading fees paid by users when swapping against Bags DBC pools (pre-migration) and DAMMv2 pools (post-migration). These fees exclude the underlying Meteora protocol fee and DAMMv2 LP Fees and any referral fees.",
    Revenue: "Trading-fee revenue earned by Bags from DBC (pre-migration), For DAMMv2 (post-migration), this is Bags accrued fees based on on-chain fee share events.",
    ProtocolRevenue: "Net Revenue earned by the Bags protocol from trading activity"
  },
}

export default adapter
