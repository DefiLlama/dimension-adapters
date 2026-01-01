import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const VAULT = "0xE0d3cC7cdDBbFeD0CEdFEB22c6D08e392CD9DA1A";

// Known liquid staking pool addresses (manually mapped from documentation)
const KNOWN_LIQUID_STAKING_POOLS = [
  '0x17df9c605574b99867fde32e69cf0a2c8e7e70c9', // LeverageStaking
  '0x267b19d608fd0fff4d533f56d750590bc85293ba', // LeverageStaking ETF
  '0x9234754a9060a52a634b3c6b8118f76bad1a448',  // LeverageStaking Production
  '0xf5361c4912bc0ef983bef26342aca525b0812085', // 3x ETH Staking ETF
].map(a => a.toLowerCase());

// Keywords for pools not in the known list
const LIQUID_STAKING_KEYWORDS = ['leverage', 'staking', 'eth', '3x'];

const fetch = async ({
  api,
  createBalances,
  getFromBlock,
  getToBlock,
}: FetchOptions) => {
  const dailyFees = createBalances();

  const fromBlock = await getFromBlock();
  const toBlock = await getToBlock();

  const managerClaimTopic = '0x1bf0129823b56213a46996bc874ce50b318995cae2bbdcd2000933d36012547d';

  const managerClaims = await api.getLogs({
    target: VAULT,
    topic: managerClaimTopic,
    fromBlock,
    toBlock,
  });

  if (managerClaims.length === 0) {
    return { dailyFees, dailyRevenue: dailyFees };
  }

  // Get unique pool addresses
  const poolAddresses = [...new Set(managerClaims.map(log => 
    '0x' + log.topics[2].slice(26)
  ))];

  // Query names and symbols for pools not in known list
  const names = await api.multiCall({
    abi: 'function name() view returns (string)',
    calls: poolAddresses.map(pool => ({ target: pool })),
    permitFailure: true
  });

  const symbols = await api.multiCall({
    abi: 'function symbol() view returns (string)',
    calls: poolAddresses.map(pool => ({ target: pool })),
    permitFailure: true
  });

  // Identify liquid staking pools
  const liquidStakingPools = new Set<string>();
  
  poolAddresses.forEach((pool, i) => {
    const poolLower = pool.toLowerCase();
    
    // First check if it's a known pool
    if (KNOWN_LIQUID_STAKING_POOLS.includes(poolLower)) {
      liquidStakingPools.add(poolLower);
      return;
    }
    
    // Otherwise check by name/symbol keywords
    const name = (names[i] || '').toLowerCase();
    const symbol = (symbols[i] || '').toLowerCase();
    const combined = `${name} ${symbol}`;
    
    const isLiquidStaking = LIQUID_STAKING_KEYWORDS.some(keyword => 
      combined.includes(keyword)
    );
    
    if (isLiquidStaking) {
      liquidStakingPools.add(poolLower);
    }
  });

  // Process logs - only count fees from liquid staking pools
  for (const log of managerClaims) {
    const pool = ('0x' + log.topics[2].slice(26)).toLowerCase();
    
    if (liquidStakingPools.has(pool)) {
      const token = '0x' + log.data.slice(26, 66);
      const amount = '0x' + log.data.slice(66, 130);
      dailyFees.add(token.toLowerCase(), amount);
    }
  }

  return {
    dailyFees,
    dailyRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: 1673913600,
    },
  },
  methodology: {
    Fees: "Tracks manager claim fees from Desyn liquid staking pools including LeverageStaking and 3x ETH Staking ETF",
  },
};

export default adapter;