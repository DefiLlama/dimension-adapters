import { queryAllium } from './allium';
import { FetchOptions } from '../adapters/types';

export const fetchBuilderCodeRevenue = async ({ options, builder_address }: { options: FetchOptions, builder_address: string }) => {
  // Delay as data is available only after 48 hours
  const startTimestamp = options.startTimestamp - 86400;
  const endTimestamp = options.startTimestamp;
  const dailyFees = options.createBalances();
  const dailyVolume = options.createBalances();

  const combinedQuery = `
    WITH builder_fees AS (
      SELECT 
        SUM(builder_fee) as total_builder_fees
      FROM hyperliquid.raw.builder_fills
      WHERE timestamp >= TO_TIMESTAMP_NTZ('${startTimestamp}')
        AND timestamp <= TO_TIMESTAMP_NTZ('${endTimestamp}')
        AND builder_address = '${builder_address}'
    ),
    dex_volume AS (
      SELECT 
        SUM(usd_amount) as total_volume
      FROM hyperliquid.dex.trades
      WHERE timestamp >= TO_TIMESTAMP_NTZ('${startTimestamp}')
        AND timestamp <= TO_TIMESTAMP_NTZ('${endTimestamp}')
        AND builder = '${builder_address}'
    )
    SELECT 
      COALESCE(bf.total_builder_fees, 0) as total_fees,
      COALESCE(dv.total_volume, 0) as total_volume
    FROM builder_fees bf
    CROSS JOIN dex_volume dv
  `;

  const data = await queryAllium(combinedQuery);

  // Use the combined results
  const totalFees = data[0]?.total_fees || 0;
  const totalVolume = data[0]?.total_volume || 0;

  dailyFees.addCGToken('usd-coin', totalFees);
  dailyVolume.addCGToken('usd-coin', totalVolume);

  return { dailyVolume, dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
};
