import { getTimestampAtStartOfDayUTC, getTimestampAtStartOfPreviousDayUTC } from '../utils/date';
import { httpGet } from '../utils/fetchURL';
import { queryAllium } from '../helpers/allium';
import { Balances } from '@defillama/sdk';
import { Dependencies, FetchOptions, ProtocolType, SimpleAdapter } from '../adapters/types';
import { CHAIN } from './chains';
import { METRIC } from './metrics';

interface ChainMapping {
  [key: string]: string;
}

export const chainMap: ChainMapping = {
  [CHAIN.ETHEREUM]: 'ethereum',
  [CHAIN.BASE]: 'base',
  [CHAIN.OPTIMISM]: 'optimism',
  [CHAIN.SCROLL]: 'scroll',
  [CHAIN.BSC]: 'bsc',
  [CHAIN.ARBITRUM]: 'arbitrum',
  [CHAIN.POLYGON]: 'polygon',
  [CHAIN.BLAST]: 'blast',
  [CHAIN.CELO]: 'celo',
  [CHAIN.BERACHAIN]: 'berachain',
  [CHAIN.SONIC]: 'sonic',
  [CHAIN.MANTLE]: 'mantle',
  [CHAIN.LINEA]: 'linea',
  [CHAIN.SEI]: 'sei',
  [CHAIN.RIPPLE]: 'ripple',
  [CHAIN.RONIN]: 'ronin',
  [CHAIN.FRAXTAL]: 'fraxtal',
  [CHAIN.METIS]: 'metis',
  [CHAIN.UNICHAIN]: 'unichain',
  [CHAIN.MODE]: 'mode',
};


export const fetchTransactionFees = async (options: FetchOptions): Promise<Balances> => {
  const chainKey = chainMap[options.chain];
  if (!chainKey) {
    throw new Error('[Pull fees transactions] Chain not supported: ' + options.chain);
  }

  const query = `
    SELECT 
      SUM(gas_price * receipt_gas_used) AS tx_fees
    FROM ${chainKey}.raw.transactions
    WHERE block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
    AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
  `;

  const dailyFees = options.createBalances();
  const res = await queryAllium(query);
  dailyFees.addGasToken(res[0].tx_fees, METRIC.TRANSACTION_GAS_FEES);
  return dailyFees;
};

export function fetchChainTransactionFeesExport({ chain, start }: { chain: CHAIN, start?: any }): SimpleAdapter {
  return {
    adapter: {
      [chain]: {
        fetch: async (_a: any, _b: any, options: FetchOptions) => {
          const transactionFees = await fetchTransactionFees(options)
          return {
            dailyFees: transactionFees,
            dailyRevenue: transactionFees,
          }
        },
        start,
      },
    },
    version: 1,
    dependencies: [Dependencies.ALLIUM],
    protocolType: ProtocolType.CHAIN,
    isExpensiveAdapter: true,
  }
}

export const chainAdapter = (adapterKey: string, assetID: string, startTime: number) => {
  const fetch = async (timestamp: number) => {
    const today = new Date(getTimestampAtStartOfDayUTC(timestamp) * 1000).toISOString()
    const yesterday = new Date(getTimestampAtStartOfPreviousDayUTC(timestamp) * 1000).toISOString()
    const dailyFee = await getOneDayFees(assetID, yesterday, today);

    return {
      timestamp,
      dailyFees: dailyFee,
    };
  };

  return {
    [adapterKey]: {
      fetch: fetch,
      start: startTime
    }
  }
};

export const getOneDayFees = async (assetID: string, startDate: string, endDate: string) => {
  const result = await httpGet(`https://community-api.coinmetrics.io/v4/timeseries/asset-metrics?page_size=10000&metrics=FeeTotUSD&assets=${assetID}&start_time=${startDate}&end_time=${endDate}`);
  if (!result.data[0]) {
    throw new Error(`Failed to fetch CoinMetrics data for ${assetID} on ${endDate}`);
  }

  return parseFloat(result.data[1]['FeeTotUSD']);
}
