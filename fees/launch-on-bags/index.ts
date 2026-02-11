import { Dependencies, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSqlFromFile, queryDuneSql } from "../../helpers/dune";
import { FetchOptions } from "../../adapters/types";
import { METRIC } from "../../helpers/metrics";

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
  const dailySupplySideRevenue = options.createBalances();
  data.forEach(row => {
    const creatorFees = Number(row.daily_fees) - Number(row.daily_protocol_revenue);
    dailyFees.add(row.quote_mint, row.daily_protocol_revenue, METRIC.PROTOCOL_FEES);
    dailyProtocolRevenue.add(row.quote_mint, row.daily_protocol_revenue, METRIC.PROTOCOL_FEES);
    dailyFees.add(row.quote_mint, creatorFees, METRIC.CREATOR_FEES);
    dailySupplySideRevenue.add(row.quote_mint, creatorFees, METRIC.CREATOR_FEES);
  });

  return {
    dailyFees,
    dailySupplySideRevenue,
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
    SupplySideRevenue: "Creator fees paid to token creators from Bags DBC pools (pre-migration) and DAMMv2 pools (post-migration).",
    Revenue: "Trading-fee revenue earned by Bags from DBC (pre-migration), For DAMMv2 (post-migration).",
    ProtocolRevenue: "Net Revenue earned by the Bags protocol from trading activity"
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.CREATOR_FEES]: 'Creator fees to token creators from Bags DBC pools (pre-migration) and DAMMv2 pools (post-migration).',
      [METRIC.PROTOCOL_FEES]: 'Protocol fees to Bags protocol from Bags DBC pools (pre-migration) and DAMMv2 pools (post-migration).',
    },
    SupplySideRevenue: {
      [METRIC.CREATOR_FEES]: 'Creator fees to token creators from Bags DBC pools (pre-migration) and DAMMv2 pools (post-migration).',
    },
    Revenue: {
      [METRIC.PROTOCOL_FEES]: 'Protocol fees to Bags protocol from Bags DBC pools (pre-migration) and DAMMv2 pools (post-migration).',
    },
    ProtocolRevenue: {
      [METRIC.PROTOCOL_FEES]: 'Protocol fees to Bags protocol from Bags DBC pools (pre-migration) and DAMMv2 pools (post-migration).',
    },
  }
}

export default adapter
