import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import BigNumber from "bignumber.js";

const CONFIG = {
  [CHAIN.ETHEREUM]: {
    vault: '0x9eF52D8953d184840F2c69096B7b3A7dA7093685',
    tokens: [
      '0xdac17f958d2ee523a2206206994597c13d831ec7', // USDT
      '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'  // USDC
    ]
  },
  [CHAIN.BSC]: {
    vault: '0xCc5Df5C68d8c991035B6A437D4e00A99875228E4',
    tokens: [
      '0x55d398326f99059ff775485246999027b3197955', // USDT
      '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d'  // USDC
    ]
  },
  [CHAIN.POLYGON]: {
    vault: '0xCc5Df5C68d8c991035B6A437D4e00A99875228E4',
    tokens: [
      '0xc2132d05d31c914a87c6611c10748aeb04b58e8f', // USDT
      '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359'  // USDC
    ]
  },
  [CHAIN.ARBITRUM]: {
    vault: '0xCc5Df5C68d8c991035B6A437D4e00A99875228E4',
    tokens: [
      '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9', // USDT
      '0xaf88d065e77c8cc2239327c5edb3a432268e5831'  // USDC
    ]
  },
  [CHAIN.OPTIMISM]: {
    vault: '0xCc5Df5C68d8c991035B6A437D4e00A99875228E4',
    tokens: [
      '0x94b008aa00579c1307b0ef2c499ad98a8ce58e58', // USDT
      '0x0b2c639c533813f4aa9d7837caf62653d097ff85'  // USDC
    ]
  },
  [CHAIN.AVAX]: {
    vault: '0xC3e9006559cB209a987e99257986aA5Ce324F829',
    tokens: [
      '0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7', // USDt
      '0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e'  // USDC
    ]
  },
  [CHAIN.BASE]: {
    vault: '0xCc5Df5C68d8c991035B6A437D4e00A99875228E4',
    tokens: [
      '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'  // USDC
    ]
  }
}

const abis = {
  getTVL: "function getTVL(address _token) view returns (uint256)"
}

// APY rates - update these as needed
const USDT_APY = 0.09;      // 9.00% - user yield
const ZBT_APY = 0.0873;     // 8.73% - protocol revenue  
const TOTAL_APY = USDT_APY + ZBT_APY; // 17.73% - total yield generated

const fetch = async (options: FetchOptions) => {
  const config = CONFIG[options.chain];
  if (!config) {
    throw new Error(`Chain ${options.chain} not supported`);
  }

  const { vault, tokens } = config;
  
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  
  // Get TVL for each token
  const tvlBalances = await options.api.multiCall({ 
    abi: abis.getTVL, 
    calls: tokens.map((t) => ({ target: vault, params: [t]})) 
  });
  
  // Calculate number of days in the period
  const secondsInPeriod = options.endTimestamp - options.startTimestamp;
  const daysInPeriod = secondsInPeriod / 86400;
  
  // Calculate yields for each token
  tokens.forEach((token, i) => {
    const tvl = new BigNumber(tvlBalances[i].toString());
    
    // Total yield generated from basis trading (17.73% APY)
    const totalYield = tvl.multipliedBy(TOTAL_APY).multipliedBy(daysInPeriod).dividedBy(365);
    
    // User yield in USDT/USDC (9.00% APY)
    const userYield = tvl.multipliedBy(USDT_APY).multipliedBy(daysInPeriod).dividedBy(365);
    
    // Protocol revenue (8.73% APY)
    const protocolYield = tvl.multipliedBy(ZBT_APY).multipliedBy(daysInPeriod).dividedBy(365);
    
    dailyFees.add(token, totalYield.toFixed(0));
    dailySupplySideRevenue.add(token, userYield.toFixed(0));
    dailyRevenue.add(token, protocolYield.toFixed(0));
  });
  
  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2025-07-01',
    },
    [CHAIN.BSC]: {
      fetch,
      start: '2025-07-01',
    },
    [CHAIN.POLYGON]: {
      fetch,
      start: '2025-07-01',
    },
    [CHAIN.ARBITRUM]: {
      fetch,
      start: '2025-07-01',
    },
    [CHAIN.OPTIMISM]: {
      fetch,
      start: '2025-07-01',
    },
    [CHAIN.AVAX]: {
      fetch,
      start: '2025-07-01',
    },
    [CHAIN.BASE]: {
      fetch,
      start: '2025-07-01',
    },
  },
  methodology: {
    Fees: 'Total yield generated from delta-neutral basis trading on centralized exchanges (17.73% APY across all staked assets)',
    Revenue: 'Protocol retains 8.73% APY of trading yield as protocol revenue, which is converted and distributed to stakers in ZBT tokens',
    ProtocolRevenue: 'The 8.73% APY portion is used for ZBT token emissions to incentivize stakers',
    SupplySideRevenue: 'Stakers receive 9.00% APY in USDT/USDC (51% of trading yield) plus 8.73% APY in ZBT token rewards (49% of trading yield)'
  }
};

export default adapter;