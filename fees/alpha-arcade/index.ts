import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import fetchURL from "../../utils/fetchURL";

const fetch = async (options: FetchOptions) => {
  let dailyFees = 0;
  const { startTimestamp, endTimestamp } = options;

  // Convert UNIX timestamps to RFC 3339 format
  const toRFC3339 = (timestamp: number) => new Date(timestamp * 1000).toISOString();
  const startRFC3339 = toRFC3339(startTimestamp);
  const endRFC3339 = toRFC3339(endTimestamp);
  const baseURL = `https://mainnet-idx.4160.nodely.dev/v2/transactions`;
  let nextToken: string | undefined = undefined;
  const TARGET_RECEIVER = 'XUIBTKHE7ISNMCLJWXUOOK6X3OCP3GVV3Z4J33PHMYX6XXK3XWN3KDMMNI';
  const TARGET_ASSET_ID = 31566704;

  do {
    let url = `${baseURL}?min-round=1&max-round=999999999&after-time=${startRFC3339}&before-time=${endRFC3339}&address=${TARGET_RECEIVER}&address-role=receiver`;
    if (nextToken) {
      url += `&next=${nextToken}`;
    }

    const response = await fetchURL(url);
    const txns = response.transactions || [];


    const amounts = getAmountsForReceiver(txns, TARGET_RECEIVER, TARGET_ASSET_ID);
    for (const amount of amounts) {
      if (typeof amount === 'number' && !isNaN(amount)) {
        dailyFees += amount;
      }
    }

    nextToken = response['next-token'];
  } while (nextToken);

  return {
    dailyFees: dailyFees / 1e6, // Convert from microUSDC
    dailyRevenue: dailyFees / 1e6, // Convert from microUSDC
    dailyProtocolRevenue: dailyFees / 1e6,  // Convert from microUSDC
  };
};

function getAmountsForReceiver(transactions: any[], receiver: string, assetId: number): number[] {
  const amounts: number[] = [];

  function searchTxns(txns: any[]) {
    for (const txn of txns) {
      if (
        txn['asset-transfer-transaction'] &&
        txn['asset-transfer-transaction'].receiver === receiver &&
        txn['asset-transfer-transaction']['asset-id'] === assetId
      ) {
        amounts.push(txn['asset-transfer-transaction'].amount);
      }
      if (txn['inner-txns']) {
        searchTxns(txn['inner-txns']);
      }
    }
  }

  searchTxns(transactions);
  return amounts;
}

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: 'Trading fees paid by users on Alpha Arcade platform',
  },
  Revenue: {
    [METRIC.TRADING_FEES]: 'All trading fees are retained by the protocol as revenue',
  },
  ProtocolRevenue: {
    [METRIC.TRADING_FEES]: 'All trading fees are collected by Alpha Arcade protocol treasury',
  }
};

const adapter: SimpleAdapter = {
  version: 2,
  chains: [CHAIN.ALGORAND],
  fetch,
  start: '2025-03-30',
  methodology: {
    Fees: 'Trading fees paid by users.',
    Revenue: 'All trading fees are revenue.',
    ProtocolRevenue: 'All trading fees are collected by Alpha Arcade.',
  },
  breakdownMethodology,
};

export default adapter;