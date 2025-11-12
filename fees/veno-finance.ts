import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// Contract addresses
const CONTRACTS = {
  [CHAIN.CRONOS]: {
    LCRO: "0x9Fae23A2700FEeCd5b93e43fDBc03c76AA7C08A6",
    LATOM: "0xac974ee7fc5d083112c809ccb3fce4a4f385750d",
  },
  [CHAIN.ERA]: {
    LETH: "0xE7895ed01a1a6AAcF1c2E955aF14E7cf612E7F9d",
  }
};

// Fee parameters
const CRONOS_FEE_RATE = 0.1; // 10% on staking rewards
const ZKSYNC_PROTOCOL_SHARE = 0.06; // 6% (50% of 12% total fee)

// to calculate liquid staking yield
async function calculateLSTYield(
  options: FetchOptions,
  tokenAddress: string,
  totalPooledMethod: string,
  decimals: number = 18
): Promise<number> {
  try {
    const supplyBefore = await options.fromApi.call({
      target: tokenAddress,
      abi: 'uint256:totalSupply',
    });
    const supplyAfter = await options.toApi.call({
      target: tokenAddress,
      abi: 'uint256:totalSupply',
    });

    if (!supplyBefore || !supplyAfter || supplyBefore == 0 || supplyAfter == 0) {
      return 0;
    }

    const pooledBefore = await options.fromApi.call({
      target: tokenAddress,
      abi: `uint256:${totalPooledMethod}`,
    });
    const pooledAfter = await options.toApi.call({
      target: tokenAddress,
      abi: `uint256:${totalPooledMethod}`,
    });

    // Calculate yield: (change in exchange rate) * current supply
    const stakingYield = (pooledAfter / supplyAfter - pooledBefore / supplyBefore) * (supplyAfter / 10 ** decimals);
    return stakingYield > 0 ? stakingYield : 0;
  } catch (e) {
    // Token doesn't exist yet or contract call failed
    return 0;
  }
}

const fetchCronosFees = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  // LCRO - Liquid CRO
  const croYield = await calculateLSTYield(options, CONTRACTS[CHAIN.CRONOS].LCRO, 'getTotalPooledCro');
  if (croYield > 0) {
    dailyFees.addCGToken("crypto-com-chain", croYield);
  }

  // LATOM - Liquid ATOM (ATOM uses 6 decimals)
  const atomYield = await calculateLSTYield(options, CONTRACTS[CHAIN.CRONOS].LATOM, 'getTotalPooledToken');
  if (atomYield > 0) {
    dailyFees.addCGToken("cosmos", atomYield / 1e6);
  }

  const dailyRevenue = dailyFees.clone(CRONOS_FEE_RATE);
  
  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const fetchZkSyncFees = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  // LETH - Liquid ETH
  const ethYield = await calculateLSTYield(options, CONTRACTS[CHAIN.ERA].LETH, 'getTotalPooledToken');
  if (ethYield > 0) {
    dailyFees.addGasToken(ethYield);
  }

  // 12% total fee: 50% to Reservoir (protocol), 50% to Kiln (service provider)
  const dailyRevenue = dailyFees.clone(ZKSYNC_PROTOCOL_SHARE);
  
  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const methodology = {
  Fees: "Total staking rewards earned from delegated CRO, ATOM, TIA, and ETH",
  Revenue: "Veno charges a 10% fee on staking rewards on Cronos (includes validator commission) and a 12% fee on zkSync Era (split 50/50 between protocol and Kiln). Additionally, a 0.2% withdrawal fee is charged when users unstake.",
  ProtocolRevenue: "On Cronos: 10% of staking rewards. On zkSync Era: 6% of staking rewards (50% of the 12% fee, with the other 50% going to Kiln)"
}

const adapter: SimpleAdapter = {
  version: 2,
  methodology,
  adapter: {
    [CHAIN.CRONOS]: {
      fetch: fetchCronosFees,
      start: '2022-10-01',
    },
    [CHAIN.ERA]: {
      fetch: fetchZkSyncFees,
      start: '2024-01-01',
    }
  }
}

export default adapter;
