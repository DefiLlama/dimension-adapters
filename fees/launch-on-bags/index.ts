import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSqlFromFile, queryDuneSql } from "../../helpers/dune";
import { METRIC } from "../../helpers/metrics";
import { httpGet } from "../../utils/fetchURL";

const DAMMV2_API_URL = "https://bags-adapter-api.datapi.meteora.ag/v1/fees";

interface IDbcData {
  quote_mint: string;
  daily_fees: string;
  daily_protocol_revenue: string;
}

// DAMMv2 data from API (USD values)
interface IDammv2FeeResult {
  timestamp: number;
  timestamp_str: string;
  fees: number;
  protocol_revenue: number;
}

interface IDammv2FeeResponse {
  start_time: number;
  end_time: number;
  results: IDammv2FeeResult[];
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dbcQuery = getSqlFromFile('helpers/queries/bags.sql', {
    tx_signer: 'BAGSB9TpGrZxQbEsrEznv5jXXdwyP6AXerN8aVRiAmcv',
    start: options.startTimestamp,
    end: options.endTimestamp
  })

  const dbcData: IDbcData[] = await queryDuneSql(options, dbcQuery);
  const dailyFees = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  dbcData.forEach(row => {
    const protocolFees = Number(row.daily_protocol_revenue);
    const creatorFees = Number(row.daily_fees) - protocolFees;

    dailyFees.add(row.quote_mint, protocolFees, METRIC.PROTOCOL_FEES);
    dailyProtocolRevenue.add(row.quote_mint, protocolFees, METRIC.PROTOCOL_FEES);
    dailyFees.add(row.quote_mint, creatorFees, METRIC.CREATOR_FEES);
  });

  // Fetch DAMMv2 data from API (post-migration)
  // DAMMV2_API_URL return fee in USD value
  // startTimestamp need to add 1 seconds to match the start of the day 
  const dammv2Url = `${DAMMV2_API_URL}?start_time=${options.startTimestamp + 1}&end_time=${options.endTimestamp}`;
  const dammv2Response: IDammv2FeeResponse = await httpGet(dammv2Url);

  dammv2Response.results.forEach(r => {
    const totalFees = r.fees ?? 0;
    const protocolRevenue = r.protocol_revenue ?? 0;
    const creatorFees = totalFees - protocolRevenue;

    dailyFees.addUSDValue(protocolRevenue, METRIC.PROTOCOL_FEES);
    dailyProtocolRevenue.addUSDValue(protocolRevenue, METRIC.PROTOCOL_FEES);

    dailyFees.addUSDValue(creatorFees, METRIC.CREATOR_FEES);
  })


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
    Revenue: "Trading-fee revenue earned by Bags from DBC (pre-migration), For DAMMv2 (post-migration).",
    ProtocolRevenue: "Net Revenue earned by the Bags protocol from trading activity"
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.CREATOR_FEES]: 'Creator fees to token creators from Bags DBC pools (pre-migration) and DAMMv2 pools (post-migration).',
      [METRIC.PROTOCOL_FEES]: 'Protocol fees to Bags protocol from Bags DBC pools (pre-migration) and DAMMv2 pools (post-migration).',
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
