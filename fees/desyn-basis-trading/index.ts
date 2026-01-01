import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const VAULT = "0xE0d3cC7cdDBbFeD0CEdFEB22c6D08e392CD9DA1A";

// Known basis trading pool addresses (manually mapped from documentation)
const KNOWN_BASIS_TRADING_POOLS = [
  '0xcf7190732ca52167a51debf2cef62f8492a23a3d', // DTBT
  '0x8c174bfa28390719fedf68df79ffdc15da60617d', // TBill
  '0x5b54fa836a7ba94c8b8a18feb96222216e1452ff0', // dSTBT-Test
  '0x52e68ae1038fde626db5cebce8df61d733e96e5e', // TBill production
  '0x6b2c42d2aa4cb2d859cf7a88546db12ae294f303', // dSTBT production
].map(a => a.toLowerCase());

// Keywords for pools not in the known list
const BASIS_TRADING_KEYWORDS = ['tbill', 'treasury', 'dtbt', 'dstbt', 'stbt', 'bond', 'value', 'classic'];

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

  // Identify basis trading pools
  const basisTradingPools = new Set<string>();
  
  poolAddresses.forEach((pool, i) => {
    const poolLower = pool.toLowerCase();
    
    // First check if it's a known pool
    if (KNOWN_BASIS_TRADING_POOLS.includes(poolLower)) {
      basisTradingPools.add(poolLower);
      return;
    }
    
    // Otherwise check by name/symbol keywords
    const name = (names[i] || '').toLowerCase();
    const symbol = (symbols[i] || '').toLowerCase();
    const combined = `${name} ${symbol}`;
    
    const isBasisTrading = BASIS_TRADING_KEYWORDS.some(keyword => 
      combined.includes(keyword)
    );
    
    if (isBasisTrading) {
      basisTradingPools.add(poolLower);
    }
  });

  // Process logs - only count fees from basis trading pools
  for (const log of managerClaims) {
    const pool = ('0x' + log.topics[2].slice(26)).toLowerCase();
    
    if (basisTradingPools.has(pool)) {
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
    Fees: "Tracks manager claim fees from Desyn basis trading pools including DTBT, TBill, dSTBT, and Value Classic Fund",
  },
};

export default adapter;