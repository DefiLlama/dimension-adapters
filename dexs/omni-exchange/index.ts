import { request, gql } from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Organized subgraph endpoints
const SUBGRAPHS = {
  [CHAIN.BASE]: {
    v2: "https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/omni-v2-base/prod/gn",
    v3: "https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/omni-v3-base/prod/gn",
    clamm: "https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/omni-clamm-base/prod/gn",
    bin: "https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/omni-bin-base/prod/gn"
  },
  [CHAIN.ARBITRUM]: {
    v2: "https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/omni-v2-arbitrum/prod/gn",
    v3: "https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/omni-v3-arbitrum/prod/gn",
    clamm: "https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/omni-clamm-arbitrum/prod/gn",
    bin: "https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/omni-bin-arbitrum/prod/gn"
  },
  [CHAIN.OPTIMISM]: {
    v2: "https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/omni-v2-optimism/prod/gn",
    v3: "https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/omni-v3-optimism/prod/gn",
    clamm: "https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/omni-clamm-optimism/prod/gn",
    bin: "https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/omni-bin-optimism/prod/gn"
  },
  [CHAIN.AVAX]: {
    v2: "https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/omni-v2-avalanche/prod/gn",
    v3: "https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/omni-v3-avalanche/prod/gn",
    clamm: "https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/omni-clamm-avalanche/prod/gn",
    bin: "https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/omni-bin-avalanche/prod/gn"
  },
  [CHAIN.SONIC]: {
    v2: "https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/omni-v2-sonic/prod/gn",
    v3: "https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/omni-v3-sonic/prod/gn",
    clamm: "https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/omni-clamm-sonic/prod/gn",
    bin: "https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/omni-bin-sonic/prod/gn"
  },
  [CHAIN.BSC]: {
    v2: "https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/omni-v2-bsc/prod/gn",
    v3: "https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/omni-v3-bsc/prod/gn",
    clamm: "https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/omni-clamm-bsc/prod/gn",
    bin: "https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/omni-bin-bsc/prod/gn"
  }
};

// Different queries for different pool types
const V2_QUERY = gql`
  query getV2Volume($id: String!) {
    protocolDayData(id: $id) {
      id
      date
      dailyVolumeUSD
      totalVolumeUSD
    }
  }
`;

const V3_CLAMM_BIN_QUERY = gql`
  query getVolume($id: String!) {
    protocolDayData(id: $id) {
      id
      date
      volumeUSD
      feesUSD
    }
  }
`;

// Pool type configurations
const POOL_CONFIGS = {
  v2: { query: V2_QUERY, volumeField: 'dailyVolumeUSD', feesField: null },
  v3: { query: V3_CLAMM_BIN_QUERY, volumeField: 'volumeUSD', feesField: 'feesUSD' },
  clamm: { query: V3_CLAMM_BIN_QUERY, volumeField: 'volumeUSD', feesField: 'feesUSD' },
  bin: { query: V3_CLAMM_BIN_QUERY, volumeField: 'volumeUSD', feesField: 'feesUSD' }
};

// Function to get volume from a single subgraph
async function getSubgraphVolume(endpoint: string, poolType: string, dateId: number) {
  try {
    const config = POOL_CONFIGS[poolType];
    if (!config) {
      return { volume: 0, fees: 0 };
    }

    console.log(`  Querying ${poolType} for date ${dateId}...`);
    const data = await request(endpoint, config.query, { id: dateId.toString() });
    
    console.log(`  ${poolType} response:`, JSON.stringify(data, null, 2));
    
    if (data.protocolDayData) {
      const dayData = data.protocolDayData;
      const volume = parseFloat(dayData[config.volumeField] || 0);
      const fees = config.feesField ? parseFloat(dayData[config.feesField] || 0) : 0;
      
      console.log(`  ${poolType} parsed: volume=${volume}, fees=${fees}`);
      return { volume, fees };
    }
    
    console.log(`  ${poolType}: No data found for date ${dateId}`);
    return { volume: 0, fees: 0 };
    
  } catch (error) {
    console.log(`Error fetching ${poolType} from ${endpoint}:`, error.message);
    return { volume: 0, fees: 0 };
  }
}

// Create fetch function for a specific chain
const fetchChain = (chain: string) => async (options: FetchOptions) => {
  const { startTimestamp } = options;
  const dateId = Math.floor(startTimestamp / 86400);
  
  const subgraphs = SUBGRAPHS[chain];
  if (!subgraphs) {
    return { dailyVolume: 0, dailyFees: 0, timestamp: startTimestamp };
  }
  
  let chainDailyVolume = 0;
  let chainDailyFees = 0;
  
  console.log(`\n=== ${chain.toUpperCase()} ===`);
  console.log(`Date ID: ${dateId} (timestamp: ${startTimestamp})`);
  
  // Query each pool type for this chain  
  for (const [poolType, endpoint] of Object.entries(subgraphs)) {
    const result = await getSubgraphVolume(endpoint, poolType, dateId);
    
    chainDailyVolume += result.volume;
    chainDailyFees += result.fees;
    
    console.log(`${poolType}: ${result.volume.toFixed(2)} volume, ${result.fees.toFixed(2)} fees`);
  }
  
  console.log(`${chain} TOTAL: ${chainDailyVolume.toFixed(2)} volume, ${chainDailyFees.toFixed(2)} fees`);
  
  return {
    dailyVolume: chainDailyVolume,
    dailyFees: chainDailyFees,
    timestamp: startTimestamp,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BASE]: {
      fetch: fetchChain(CHAIN.BASE),
      start: 1672531200, // Jan 1, 2023
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetchChain(CHAIN.ARBITRUM),
      start: 1672531200,
    },
    [CHAIN.OPTIMISM]: {
      fetch: fetchChain(CHAIN.OPTIMISM),
      start: 1672531200,
    },
    [CHAIN.AVAX]: {
      fetch: fetchChain(CHAIN.AVAX),
      start: 1672531200,
    },
    [CHAIN.SONIC]: {
      fetch: fetchChain(CHAIN.SONIC),
      start: 1672531200,
    },
    [CHAIN.BSC]: {
      fetch: fetchChain(CHAIN.BSC),
      start: 1672531200,
    },
  }
};

export default adapter;