import { queryAllium } from './allium';
import { FetchOptions } from '../adapters/types';

export const fetchBuilderCodeRevenue = async ({ options, builder_address }: { options: FetchOptions, builder_address: string }) => {
  // Delay as data is available only after 48 hours
  const startTimestamp = options.startTimestamp - 86400;
  const endTimestamp = options.startTimestamp;
  const dailyFees = options.createBalances();
  const dailyVolume = options.createBalances();

  const combinedQuery = `
    WITH trades_with_builder_fees AS (
      SELECT 
        t.transaction_hash,
        t.usd_amount as volume,
        COALESCE(bf.builder_fee, t.builder_fee) as fees
      FROM hyperliquid.dex.trades t
      LEFT JOIN hyperliquid.raw.builder_transactions bt 
        ON t.transaction_hash = bt.transaction_hash
      LEFT JOIN hyperliquid.raw.builder_fills bf
        ON t.transaction_hash = bf.transaction_hash 
        AND bf.builder_address = '${builder_address}'
      WHERE t.timestamp >= TO_TIMESTAMP_NTZ('${startTimestamp}')
        AND t.timestamp <= TO_TIMESTAMP_NTZ('${endTimestamp}')
        AND (t.builder = '${builder_address}' OR bt.builder_address = '${builder_address}')
    )
    SELECT 
      SUM(fees) as total_fees,
      SUM(volume) as total_volume
    FROM trades_with_builder_fees
  `;

  const data = await queryAllium(combinedQuery);

  // Use the combined results
  const totalFees = data[0]?.total_fees || 0;
  const totalVolume = data[0]?.total_volume || 0;

  dailyFees.addCGToken('usd-coin', totalFees);
  dailyVolume.addCGToken('usd-coin', totalVolume);

  return { dailyVolume, dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
};
