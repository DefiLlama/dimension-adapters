import { queryAllium } from './allium';
import { FetchOptions } from '../adapters/types';

export const fetchBuilderCodeRevenue = async ({ options, builder_address }: { options: FetchOptions, builder_address: string }) => {
  // Delay as data is available only after 48 hours
  const startTimestamp = options.startOfDay;
  const endTimestamp = startTimestamp + 86400;
  const dailyFees = options.createBalances();
  const dailyVolume = options.createBalances();

  // Builder fees and trade volume are calculated from both hyperliquid.raw.builder_fills and hyperliquid.dex.trades
  // hyperliquid.raw.builder_fills is the source of truth for builder fee attribution with ~1-2 day delay
  // hyperliquid.dex.trades provides builder fee data but relies on matching with builder_transactions
  // Builder fee data from the most recent ~48 hours should be treated as an estimate
  // When running the adapter daily at UTC 00:00, we check if Allium has filled any builder_fills data
  // for the given timerange. If count is zero, we throw an error indicating data is not yet available.

  const query = `
    WITH builder_fills_check AS (
      SELECT 
        COUNT(*) as fills_count
      FROM hyperliquid.raw.builder_fills
      WHERE timestamp >= TO_TIMESTAMP_NTZ('${startTimestamp}')
        AND timestamp <= TO_TIMESTAMP_NTZ('${endTimestamp}')
    ),
    builder_fees AS (
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
      bfc.fills_count,
      COALESCE(bf.total_builder_fees, 0) as total_fees,
      COALESCE(dv.total_volume, 0) as total_volume
    FROM builder_fills_check bfc
    CROSS JOIN builder_fees bf
    CROSS JOIN dex_volume dv
  `;

  const data = await queryAllium(query);

  // Check if Allium has filled any builder_fills data for the given timerange
  const fillsCount = data[0]?.fills_count || 0;
  if (fillsCount === 0) {
    throw new Error(`Allium has not filled any builder_fills data for the timerange ${startTimestamp} to ${endTimestamp}. Data is typically available with a 1-2 day delay.`);
  }

  // Use the combined results
  const totalFees = data[0]?.total_fees || 0;
  const totalVolume = data[0]?.total_volume || 0;

  dailyFees.addCGToken('usd-coin', totalFees);
  dailyVolume.addCGToken('usd-coin', totalVolume);

  return { dailyVolume, dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
};
