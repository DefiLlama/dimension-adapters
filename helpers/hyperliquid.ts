import { queryAllium } from './allium';
import { FetchOptions } from '../adapters/types';

export const fetchBuilderCodeRevenue = async ({ options, builder_address }: { options: FetchOptions, builder_address: string }) => {
  const dailyFees = options.createBalances();
  const dailyVolume = options.createBalances();

  const query = `
    SELECT 
      SUM(builder_fee) as fees,
      SUM(usd_amount) as volume
    FROM hyperliquid.dex.trades t
    WHERE timestamp >= TO_TIMESTAMP_NTZ('${options.startTimestamp}')
      AND timestamp <= TO_TIMESTAMP_NTZ('${options.endTimestamp}')
      AND builder = '${builder_address}'
  `;
  const data = await queryAllium(query);

  dailyFees.addCGToken('usd-coin', data[0].fees || 0);
  dailyVolume.addCGToken('usd-coin', data[0].volume || 0);

  return { dailyVolume, dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
};
