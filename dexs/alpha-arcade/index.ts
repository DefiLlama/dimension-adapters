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
    const alphaArcadeTxns = txns.filter((txn) => hasAnyTargetAppArg(txn, TARGET_APP_CALL_NAMES));

    for (const txn of alphaArcadeTxns) {
      if (hasAnyTargetAppArg(txn, ["uh3u9Q=="])) {  // MATCH
        const amount = getInnerTxnAmountForAppCall(txn, 'uh3u9Q==');
        dailyVolume += amount;
      } else if (
        txn['application-transaction']?.['application-args']?.[0] === 'MgBiOw==' // CLAIM
      ) {
          const innerTxn = txn['inner-txns']?.[0];
          const assetTransfer = innerTxn?.['asset-transfer-transaction'];
          if (assetTransfer && assetTransfer.amount) {
            dailyVolume += assetTransfer.amount;
          }
      } else if (
        txn['application-transaction']?.['application-args']?.[0] === 'gyGzvQ==' || // SPLIT
        txn['application-transaction']?.['application-args']?.[0] === 'jF2wVg=='   // MERGE
      ) {
        for (const innerTxn of txn['inner-txns'] || []) {
          const assetTransfer = innerTxn['asset-transfer-transaction'];
          const amount = assetTransfer?.amount || 0;
          dailyVolume += amount;
        }
      }
    }
    nextToken = response['next-token'];
  } while (nextToken);

  return {
    dailyVolume: dailyVolume / 1e6, // Convert from microUSDC
  };
};

function hasAnyTargetAppArg(txn: any, targetArgs: string[]): boolean {
  const appArgs = txn['application-transaction']?.['application-args'];
  if (Array.isArray(appArgs) && targetArgs.some(arg => appArgs.includes(arg))) {
    return true;
  }
  if (Array.isArray(txn['inner-txns'])) {
    return txn['inner-txns'].some((inner) => hasAnyTargetAppArg(inner, targetArgs));
  }
  return false;
};

function getInnerTxnAmountForAppCall(txn: any, targetArgBase64: string): number {
  let totalAmount = 0;

    if (txn["tx-type"] !== "appl" || !Array.isArray(txn["inner-txns"])) {
      return totalAmount;
    }

    for (const innerTxn of txn["inner-txns"]) {
      const appTxn = innerTxn["application-transaction"];
      if (
        appTxn &&
        Array.isArray(appTxn["application-args"]) &&
        appTxn["application-args"][0] === targetArgBase64
      ) {
        if (!Array.isArray(innerTxn["inner-txns"])) {
          continue;
        }
        for (const nestedTxn of innerTxn["inner-txns"]) {
          if (
            nestedTxn["tx-type"] === "axfer" &&
            nestedTxn["asset-transfer-transaction"]?.amount
          ) {
            totalAmount += nestedTxn["asset-transfer-transaction"].amount;
          }
      }
    }
  }
  return totalAmount;
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ALGORAND]: {
      fetch: fetch,
      start: '2025-03-30',
    }
  }
};

export default adapter;