import { Dependencies, FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const query = `
    SELECT
      date_trunc('day', b.block_timestamp) AS day,
      SUM(
        CAST(REGEXP_EXTRACT(tx.fee, '^([0-9]+)', 1) AS DOUBLE)
      ) AS total_fee_amount,
      REGEXP_EXTRACT(tx.fee, '^[0-9]+(.+)$', 1) AS fee_token
    FROM noble.transactions tx 
    LEFT JOIN noble.block_events b ON b.block_height = tx.block_height
    WHERE b.block_timestamp >= from_unixtime(${options.startTimestamp})
      AND b.block_timestamp < from_unixtime(${options.endTimestamp})
      AND tx.fee IS NOT NULL
      AND tx.fee != ''
      AND REGEXP_EXTRACT(tx.fee, '^[0-9]+(.+)$', 1) IS NOT NULL
    GROUP BY 1, REGEXP_EXTRACT(tx.fee, '^[0-9]+(.+)$', 1)
    ORDER BY day DESC
  `;

  const results = await queryDuneSql(options, query);

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  const feesByToken: Record<string, number> = {};
  
  results.forEach((row: any) => {
    const feeToken = row.fee_token;
    const feeAmount = Number(row.total_fee_amount) || 0;
    
    if (!feeToken) return;
    
    if (!feesByToken[feeToken]) {
      feesByToken[feeToken] = 0;
    }
    
    feesByToken[feeToken] += feeAmount;
    
  });

  // Add fees for each token
  Object.entries(feesByToken).forEach(([denom, amount]) => {
    // Noble uses uusdc for USDC (6 decimals)
    if (denom === 'uusdc') {
      dailyFees.addCGToken('usd-coin', Number(amount) / 1e6);
      dailyRevenue.addCGToken('usd-coin', Number(amount) / 1e6);
    } else {
      // For other tokens
     /* 
     {
        fee_token: 'uusdn',
        total_fee_amount: 324135
      },
      {
        fee_token: 'ueure',
        total_fee_amount: 216000
      },
      {
        fee_token: 'ibc/EF48E6B1A1A19F47ECAEA62F5670C37C0580E86A9E88498B7E393EB6F49F33C0',
        total_fee_amount: 180000
      }
      */
    }
  });

  return {
    dailyFees,
    dailyRevenue
  };
};

const methodology = {
  Fees: 'Total transaction fees paid on Noble chain',
  Revenue: 'Total transaction fees paid on Noble chain',
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.NOBLE],
  start: "2023-03-01",
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  protocolType: ProtocolType.CHAIN,
  methodology,
};

export default adapter;