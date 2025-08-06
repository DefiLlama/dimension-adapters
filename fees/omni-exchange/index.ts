import { request, gql } from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Same subgraph endpoints as DEX adapter
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

// V2 doesn't have fees, others do
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
  query getFees($id: String!) {
    protocolDayData(id: $id) {
      id
      date
      volumeUSD
      feesUSD
      protocolFeesUSD
    }
  }
`;

// Pool type configurations for fees
const POOL_CONFIGS = {
  v2: { 
    query: V2_QUERY, 
    hasProtocolFees: false, // V2 typically doesn't have protocol fees
    volumeField: 'dailyVolumeUSD'
  },
  v3: { 
    query: V3_CLAMM_BIN_QUERY, 
    hasProtocolFees: true,
    feesField: 'feesUSD',
    protocolFeesField: 'protocolFeesUSD'
  },
  clamm: { 
    query: V3_CLAMM_BIN_QUERY, 
    hasProtocolFees: true,
    feesField: 'feesUSD',
    protocolFeesField: 'protocolFeesUSD'
  },
  bin: { 
    query: V3_CLAMM_BIN_QUERY, 
    hasProtocolFees: true,
    feesField: 'feesUSD',
    protocolFeesField: 'protocolFeesUSD'
  }
};

// Function to get fees from a single subgraph
async function getSubgraphFees(endpoint: string, poolType: string, dateId: number) {
  try {
    const config = POOL_CONFIGS[poolType];
    if (!config) {
      return { totalFees: 0, protocolFees: 0, lpFees: 0, volume: 0 };
    }

    const data = await request(endpoint, config.query, { id: dateId.toString() });
    
    if (data.protocolDayData) {
      const dayData = data.protocolDayData;
      
      if (config.hasProtocolFees) {
        // V3/CLAMM/Bin have actual fee breakdown
        const totalFees = parseFloat(dayData[config.feesField] || 0);
        const protocolFees = parseFloat(dayData[config.protocolFeesField] || 0);
        const lpFees = totalFees - protocolFees; // Remainder goes to LPs
        const volume = parseFloat(dayData.volumeUSD || 0);
        
        return { totalFees, protocolFees, lpFees, volume };
      } else {
        // V2 estimate: assume 0.3% fee, 100% to LPs (no protocol fees)
        const volume = parseFloat(dayData[config.volumeField] || 0);
        const estimatedFees = volume * 0.003; // 0.3% fee
        
        return { 
          totalFees: estimatedFees, 
          protocolFees: 0, // V2 has no protocol fees typically
          lpFees: estimatedFees,
          volume 
        };
      }
    }
    
    return { totalFees: 0, protocolFees: 0, lpFees: 0, volume: 0 };
    
  } catch (error) {
    console.log(`Error fetching fees for ${poolType}:`, error.message);
    return { totalFees: 0, protocolFees: 0, lpFees: 0, volume: 0 };
  }
}

// Create fetch function for a specific chain
const fetchChain = (chain: string) => async (options: FetchOptions) => {
  const { startTimestamp } = options;
  const dateId = Math.floor(startTimestamp / 86400);
  
  const subgraphs = SUBGRAPHS[chain];
  if (!subgraphs) {
    return { 
      dailyFees: 0, 
      dailyRevenue: 0, 
      dailyProtocolRevenue: 0,
      timestamp: startTimestamp 
    };
  }
  
  let chainTotalFees = 0;
  let chainProtocolFees = 0;
  let chainLpFees = 0;
  
  console.log(`\n=== ${chain.toUpperCase()} FEES ===`);
  
  // Query each pool type for this chain
  for (const [poolType, endpoint] of Object.entries(subgraphs)) {
    const result = await getSubgraphFees(endpoint, poolType, dateId);
    
    chainTotalFees += result.totalFees;
    chainProtocolFees += result.protocolFees;
    chainLpFees += result.lpFees;
    
    console.log(`${poolType}: Total=$${result.totalFees.toFixed(2)}, Protocol=$${result.protocolFees.toFixed(2)}, LP=$${result.lpFees.toFixed(2)}`);
  }
  
  console.log(`${chain} TOTAL FEES: $${chainTotalFees.toFixed(2)} (Protocol: $${chainProtocolFees.toFixed(2)}, LP: $${chainLpFees.toFixed(2)})`);
  
  return {
    dailyFees: chainTotalFees,           // All fees paid by users
    dailyRevenue: chainTotalFees,        // Revenue = all fees collected
    dailyProtocolRevenue: chainProtocolFees, // Revenue that goes to protocol treasury
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