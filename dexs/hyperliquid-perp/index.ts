import type { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";
import { getEnv } from "../../helpers/env";
import { LLAMA_HL_INDEXER_FROM_TIME } from "../../helpers/hyperliquid";

const fetch = async (_1: number, _: any, { createBalances, startOfDay }: FetchOptions) => {
  if (startOfDay < LLAMA_HL_INDEXER_FROM_TIME) {
    throw Error('request data too old, unsupported by LLAMA_HL_INDEXER');
  }

  const endpoint = getEnv('LLAMA_HL_INDEXER')
  if (!endpoint) {
    throw Error('missing LLAMA_HL_INDEXER env');
  }

  // 20250925
  const dateString = new Date(startOfDay * 1000).toISOString().split('T')[0].replaceAll('-', '');
  const response = await httpGet(`${endpoint}/v1/data/hourly?date=${dateString}`);

  const dailyVolume = createBalances()
  const dailyFees = createBalances()

  for (const item of response.data) {
    dailyVolume.addCGToken('usd-coin', item.volumeUsd);
    dailyFees.addCGToken('usd-coin', item.perpsFeeByTokens.USDC);
  }

  return {
    dailyVolume,
    dailyFees,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.HYPERLIQUID]: {
      fetch,
      start: '2023-02-25',
    },
  }
};

export default adapter;
