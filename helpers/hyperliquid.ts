import { queryAllium } from './allium';
import { FetchOptions } from '../adapters/types';

const HL_FEE_TOKEN_CG_MAPPING: Record<string, string> = {
  'USDC': 'usd-coin'
};

export const fetchHyperliquidBuilderFees = async ({ fetchOptions, referralAddress }: { fetchOptions: FetchOptions, referralAddress: string }) => {
  const dailyFees = fetchOptions.createBalances();

  const query = `
    SELECT 
      PARSE_JSON(t._extra_fields):buyer:fee_token::string as buyer_fee_token,
      PARSE_JSON(t._extra_fields):seller:fee_token::string as seller_fee_token,
      SUM(COALESCE(TRY_TO_DECIMAL(PARSE_JSON(t._extra_fields):buyer:builder_fee::string, 38, 18), 0)) as buyer_builder_fee,
      SUM(COALESCE(TRY_TO_DECIMAL(PARSE_JSON(t._extra_fields):seller:builder_fee::string, 38, 18), 0)) as seller_builder_fee
    FROM hyperliquid.dex.trades t
    WHERE timestamp >= TO_TIMESTAMP_NTZ('${fetchOptions.startTimestamp}')
      AND timestamp <= TO_TIMESTAMP_NTZ('${fetchOptions.endTimestamp}')
    AND transaction_hash IN (SELECT 
        hash
      FROM hyperliquid.raw.transactions
      WHERE action:builder:b = '${referralAddress}'
        AND action:builder:f IS NOT NULL
        AND block_timestamp >= TO_TIMESTAMP_NTZ('${fetchOptions.startTimestamp}')
        AND block_timestamp <= TO_TIMESTAMP_NTZ('${fetchOptions.endTimestamp}')
    )
    GROUP BY buyer_fee_token, seller_fee_token;
  `;
  const data = await queryAllium(query);

  data.forEach((item: any) => {
    if (item.buyer_fee_token) {
      const token = HL_FEE_TOKEN_CG_MAPPING[item.buyer_fee_token];
      if (token) {
        const amount = parseFloat(item.buyer_builder_fee);
        if (amount > 0) {
          dailyFees.addCGToken(token, amount);
        }
      }
    }
    if (item.seller_fee_token) {
      const token = HL_FEE_TOKEN_CG_MAPPING[item.seller_fee_token];
      if (token) {
        const amount = parseFloat(item.seller_builder_fee);
        if (amount > 0) {
          dailyFees.addCGToken(token, amount);
        }
      }
    }
  });
  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
};
