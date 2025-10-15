import { Adapter, ChainBlocks, FetchOptions, FetchResult } from "../../adapters/types";
import { CHAIN } from '../../helpers/chains';
import fetchURL from "../../utils/fetchURL";

const MANTIS_INDEXER_API = `https://mantis-indexer.composable-shared-artifacts.composablenodes.tech`;
const MANTIS_VOLUME_API = `${MANTIS_INDEXER_API}/api/domain/getvolume`;


function removeInvalidKeys(obj: any) {
  Object.keys(obj).forEach(key => {
    if (key.includes("…")) {
      delete obj[key];
    }
  });
}

const fetch = async (timestamp: number, _: ChainBlocks, options: FetchOptions): Promise<FetchResult> => {
  const chain = options.chain
  const urlDaily = `${MANTIS_VOLUME_API}?timestamp=${options.startOfDay}&chain=${chain == CHAIN.ETHEREUM ? 1 : 2}&period=1&solved_only=true`;

  const volumeDaily = (await fetchURL(urlDaily)).assets;

  removeInvalidKeys(volumeDaily);

  const dailyVolume = options.createBalances();
  dailyVolume.addBalances(volumeDaily);


  return {
    dailyVolume,
    timestamp
  };
};

export default {
  deadFrom: '2025-03-05',
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: '2024-11-30',
    },
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2024-11-30',
    }
  },
  methodology: "Sum of all executed intents with Solana as input or output",
} as Adapter;
