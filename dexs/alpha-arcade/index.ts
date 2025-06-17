import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const fetch = async (options: FetchOptions) => {
    let dailyVolume = 0;
    const { startTimestamp, endTimestamp } = options;
    const TARGET_APP_CALL_NAMES = [
      'uh3u9Q==', // MATCH
      'gyGzvQ==', // SPLIT
      'jF2wVg==', // MERGE
      'MgBiOw=='  // CLAIM
    ];

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

      const alphaArcadeTxns = txns.filter((txn) => {
        const appCall = txn['application-transaction'];
        const appArgs = appCall?.['application-args'];
        if (!Array.isArray(appArgs)) return false;

        return (
          TARGET_APP_CALL_NAMES.includes(appArgs[0])
        );
      });

    //   console.log("alphaArcadeTxns:", JSON.stringify(alphaArcadeTxns, null, 2));

      for (const txn of alphaArcadeTxns) {
        const innerTxn = txn['inner-txns']?.[0];
        const amount = innerTxn?.['asset-transfer-transaction']?.amount;
        if (typeof amount === 'number' && !isNaN(amount)) {
          dailyVolume += amount;
        }
      }

      nextToken = response['next-token'];
    } while (nextToken);

    return {
      dailyVolume: dailyVolume / 1e6, // Convert from microUSDC
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