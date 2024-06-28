import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

// Define the old and new adapters
const adapterOld = univ2Adapter({
  [CHAIN.ARBITRUM]: 'https://graph-v2.rubicon.finance/subgraphs/name/Metrics_Arbitrum_V2',
  [CHAIN.OPTIMISM]: 'https://graph-v2.rubicon.finance/subgraphs/name/Metrics_Optimism_V2'
}, {
  factoriesName: "rubicons",
  totalVolume: "total_volume_usd",
  dayData: "dayVolume",
  dailyVolume: "volume_usd",
  dailyVolumeTimestampField: "dayStartUnix"
});

adapterOld.adapter.arbitrum.start = 1686345120;
adapterOld.adapter.optimism.start = 1637020800;

const adapterNew = univ2Adapter({
  [CHAIN.OPTIMISM]: 'https://graph-v2.rubicon.finance/subgraphs/name/Gladius_Metrics_Optimism_V2',
  [CHAIN.ARBITRUM]: 'https://graph-v2.rubicon.finance/subgraphs/name/Gladius_Metrics_Arbitrum_V2',
  [CHAIN.BASE]: 'https://graph-v2.rubicon.finance/subgraphs/name/Gladius_Metrics_Base_V2',
  [CHAIN.ETHEREUM]: 'https://graph-v2.rubicon.finance/subgraphs/name/Gladius_Metrics_Mainnet_V2',
}, {
  factoriesName: "rubicons",
  totalVolume: "total_volume_usd",
  dayData: "dayVolume",
  dailyVolume: "volume_usd",
  dailyVolumeTimestampField: "dayStartUnix"
});

adapterNew.adapter.arbitrum.start = 183178326;
adapterNew.adapter.optimism.start = 116354792;
adapterNew.adapter.base.start = 10029602;
adapterNew.adapter.ethereum.start = 19361393;

// Define the function to fetch and combine data from both adapters
async function combinedFetch(chain, timestamp, chainBlocks, options) {
  let oldData = null;
  let newData = null;

  if (adapterOld.adapter[chain] && adapterOld.adapter[chain].fetch) {
    oldData = await adapterOld.adapter[chain].fetch(timestamp, chainBlocks, options).catch(() => null);
  }

  if (adapterNew.adapter[chain] && adapterNew.adapter[chain].fetch) {
    newData = await adapterNew.adapter[chain].fetch(timestamp, chainBlocks, options).catch(() => null);
  }

  if (!oldData) return newData;
  if (!newData) return oldData;

  return {
    timestamp: newData.timestamp,
    totalVolume: (oldData.totalVolume || 0) + (newData.totalVolume || 0),
    dailyVolume: (oldData.dailyVolume || 0) + (newData.dailyVolume || 0),
    // Add any other fields that need to be combined here
  };
}

// Create the combined adapter
const combinedAdapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: (timestamp, chainBlocks, options) => combinedFetch(CHAIN.ARBITRUM, timestamp, chainBlocks, options),
      start: adapterOld.adapter.arbitrum.start,
    },
    [CHAIN.OPTIMISM]: {
      fetch: (timestamp, chainBlocks, options) => combinedFetch(CHAIN.OPTIMISM, timestamp, chainBlocks, options),
      start: adapterOld.adapter.optimism.start,
    },
    [CHAIN.BASE]: {
      fetch: (timestamp, chainBlocks, options) => adapterNew.adapter.base.fetch(timestamp, chainBlocks, options),
      start: adapterNew.adapter.base.start,
    },
    [CHAIN.ETHEREUM]: {
      fetch: (timestamp, chainBlocks, options) => adapterNew.adapter.ethereum.fetch(timestamp, chainBlocks, options),
      start: adapterNew.adapter.ethereum.start,
    },
  },
  version: 2,
};

export default combinedAdapter;
