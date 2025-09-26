import type { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { getEnv } from "../../helpers/env";
import { LLAMA_HL_INDEXER_FROM_TIME } from "../../helpers/hyperliquid";

// const URL = "https://api.hyperliquid.xyz/info";

// interface Response {
//   dayNtlVlm: string;
//   openInterest: string;
//   markPx: string;
// }

const fetch = async (timestamp: number, _: any, options: FetchOptions) => {
  if (timestamp < LLAMA_HL_INDEXER_FROM_TIME) {
    throw Error('request data too old, unsupported by LLAMA_HL_INDEXER');
  }

  const endpoint = getEnv('LLAMA_HL_INDEXER')
  if (!endpoint) {
    throw Error('missing LLAMA_HL_INDEXER env');
  }

  // 20250925
  const dateString = new Date(timestamp * 1000).toISOString().split('T')[0].replaceAll('-', '');
  const response = await httpGet(`${endpoint}/v1/data/hourly?date=${dateString}`);
  
  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()

  for (const item of response.data) {
    dailyVolume.addCGToken('usd-coin', item.volumeUsd);
    dailyFees.addCGToken('usd-coin', item.perpsFeeByTokens.USDC);
  }

  // const response: Response[] = (await httpPost(URL, {"type": "metaAndAssetCtxs"}))[1];
  // const dailyVolume = response.reduce((acc, item) => {
  //   return acc + Number(item.dayNtlVlm);
  // },0);
  // const openInterestAtEnd = response.reduce((acc, item) => {
  //   return acc +( Number(item.openInterest) * Number(item.markPx));
  // },0);

  return {
    dailyVolume,
    dailyFees,
    // openInterestAtEnd: openInterestAtEnd?.toString(),
    timestamp: getUniqStartOfTodayTimestamp(new Date(timestamp * 1000)),
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.HYPERLIQUID]: {
      fetch,
      // runAtCurrTime: true,
      start: '2023-02-25',
    },
  }
};

export default adapter;
