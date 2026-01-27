import { Dependencies, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSqlFromFile, queryDuneSql } from "../../helpers/dune";
import { FetchOptions } from "../../adapters/types";

interface IData {
  quote_mint: string;
  total_trading_fees: number;
  total_partner_trading_fees: number;
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const query = getSqlFromFile('helpers/queries/dbc.sql', {
    tx_signer: 'BAGSB9TpGrZxQbEsrEznv5jXXdwyP6AXerN8aVRiAmcv',
    start: options.startTimestamp,
    end: options.endTimestamp
  })

  const data: IData[] = await queryDuneSql(options, query)

  const dailyFees = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  data.forEach(row => {
    const totalTradingFee = Number(row.total_trading_fees);
    const partnerTradingFee = Number(row.total_partner_trading_fees);
    dailyFees.add(row.quote_mint, totalTradingFee);
    // Bags takes 50% of partner trading fee
    dailyProtocolRevenue.add(row.quote_mint, partnerTradingFee * 0.5);
  });

  return {
    dailyFees,
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
    Fees: "Total trading fees from DBC swaps (80% of swap fee, excludes Meteora protocol fee and referral fees).",
    ProtocolRevenue: "Bags takes 50% of partner trading fees. Calculated as (trading_fee * (100 - creator_trading_fee_percentage) / 100) * 50%.",
  },
}

export default adapter
