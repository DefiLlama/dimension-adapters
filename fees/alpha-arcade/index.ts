import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
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

    do {
      let url = `${baseURL}?min-round=1&max-round=999999999&after-time=${startRFC3339}&before-time=${endRFC3339}`;
      if (nextToken) {
        url += `&next=${nextToken}`;
      }

      const response = await fetchURL(url);
      const txns = response.transactions || [];

      const TARGET_RECEIVER = 'XUIBTKHE7ISNMCLJWXUOOK6X3OCP3GVV3Z4J33PHMYX6XXK3XWN3KDMMNI';

      for (const txn of txns) {
        const innerTxns = txn['inner-txns'] || [];
      
        for (const innerTxn of innerTxns) {
          if (
            innerTxn['tx-type'] === 'axfer' &&
            innerTxn['asset-transfer-transaction']?.['receiver'] === TARGET_RECEIVER
          ) {
            dailyFees += Number(innerTxn['asset-transfer-transaction']['amount'] || 0);
          }
        }
      }

      nextToken = response['next-token'];
    } while (nextToken);

    return {
      dailyFees: dailyFees / 1e6, // Convert from microUSDC
      dailyRevenue: dailyFees / 1e6  // Convert from microUSDC
    };
};

const adapter: SimpleAdapter = {
    version: 2,
    adapter:{
      [CHAIN.ALGORAND]: {
          fetch: fetch,
          start: '2025-03-30',
      }
    }
};

export default adapter;