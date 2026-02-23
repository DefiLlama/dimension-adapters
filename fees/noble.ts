import { Dependencies, FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const query = `
    SELECT
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
    GROUP BY REGEXP_EXTRACT(tx.fee, '^[0-9]+(.+)$', 1)
  `;

  const results = await queryDuneSql(options, query);

  const dailyFees = options.createBalances();

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
    const amountNum = Number(amount);
    // denoms https://api.noble.xyz/noble/globalfee/v1/gas_prices
    if (denom === 'uusdc') {
      dailyFees.addCGToken('usd-coin', amountNum / 1e6);
    } else if (denom === 'uusdn') {
      dailyFees.addCGToken('noble-dollar-usdn', amountNum / 1e6);
    } else if (denom === 'ibc/EF48E6B1A1A19F47ECAEA62F5670C37C0580E86A9E88498B7E393EB6F49F33C0') {
      dailyFees.addCGToken('cosmos', amountNum / 1e6);
    } else if (denom === 'ausdy') {
      dailyFees.addCGToken('ondo-us-dollar-yield', amountNum / 1e18);
    } else if (denom === 'ueure') {
      dailyFees.addCGToken('monerium-eur-money-2', amountNum / 1e6);
    }
  });

  return {
    dailyFees,
    dailySupplySideRevenue: dailyFees,
    dailyRevenue: 0,
  };
};

const methodology = {
  Fees: 'Total transaction fees paid on Noble chain',
  SupplySideRevenue: 'All the transaction fees go to validators (100% of fees)',
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
