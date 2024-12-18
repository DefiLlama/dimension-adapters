import { Adapter, ChainBlocks, FetchOptions, FetchResult } from "../../adapters/types";
import { CHAIN } from '../../helpers/chains';
import fetchURL from "../../utils/fetchURL";

const MANTIS_INDEXER_API = `https://mantis-indexer.composable-shared-artifacts.composablenodes.tech`;
const MANTIS_VOLUME_API = `${MANTIS_INDEXER_API}/api/domain/getvolume`;


function removeInvalidKeys(obj: any) {
  Object.keys(obj).forEach(key => {
    if (key.includes("…")) {
      console.log("Removing key", key);
      delete obj[key];
    }
  });
}

const fetch = async (timestamp: number, _: ChainBlocks, options: FetchOptions): Promise<FetchResult> => {
  const chain = options.chain
  const urlDaily = `${MANTIS_VOLUME_API}?timestamp=${options.startOfDay}&chain=${chain == CHAIN.ETHEREUM ? 1 : 2}&period=1&solved_only=true`;
  const urlTotal = `${MANTIS_VOLUME_API}?timestamp=${options.startOfDay}&chain=${chain == CHAIN.ETHEREUM ? 1 : 2}&period=0&solved_only=true`;

  const volumeDaily = (await fetchURL(urlDaily)).assets;
  const volumeTotal = (await fetchURL(urlTotal)).assets;

  removeInvalidKeys(volumeDaily);
  removeInvalidKeys(volumeTotal);

  const dailyVolume = options.createBalances();
  const totalVolume = options.createBalances();
  dailyVolume.addBalances(volumeDaily);
  totalVolume.addBalances(volumeTotal);


  return {
    dailyVolume,
    totalVolume,
    timestamp
  };
};

export default {
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: 1732993200,
      meta: {
        methodology: "Sum of all executed intents with Solana as input or output",
      },
    },
    [CHAIN.ETHEREUM]: {
      fetch,
      start: 1732993200,
      meta: {
        methodology: "Sum of all executed intents with Ethereum as input or output",
      },
    }
  },
} as Adapter;
