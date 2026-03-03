import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { FetchOptions, FetchResultV2 } from "../../adapters/types";
import { getUniV2LogAdapter } from "../../helpers/uniswap";

// Loxodrome has two products:
// 1. Loxodrome AMM (this adapter) - Spot trading DEX with liquidity pools
// 2. Loxodrome Perp (separate adapter) - Perpetual futures trading
//
// Factory: 0x92bfa051bf12a0aef9a5e1ac8b2aa7dc1b05a406 (main AMM factory)
// Secondary Factory: 0x9442E8d017bb3dC2Ba35d75204211e60f86fF0F8 (additional pools)
// Fee Structure: 0.5% on volatile pairs, 0.2% on stable pairs
// Revenue Model: ~85% of swap fees go to veLOXO holders (ve(3,3) tokenomics)

const FACTORY_ADDRESSES = [
  '0x92bfa051bf12a0aef9a5e1ac8b2aa7dc1b05a406',
  '0x9442E8d017bb3dC2Ba35d75204211e60f86fF0F8'
];

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();

  for (const factory of FACTORY_ADDRESSES) {
    const uniFetch = getUniV2LogAdapter({
      factory: factory,
      fees: 0.005, // 0.05%
      stableFees: 0.002, // 0.02%
    })

    const uniFetchResult = await uniFetch(options)
    
    dailyVolume.addBalances(uniFetchResult.dailyVolume)
    dailyFees.addBalances(uniFetchResult.dailyFees)
  }
  
  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees.clone(0.85),
    dailyHoldersRevenue: dailyFees.clone(0.85),
    dailySupplySideRevenue: dailyFees.clone(0.15),
    dailyProtocolRevenue: 0,
  }
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.IOTEX]: {
      fetch,
      start: '2024-01-15',
    },
  },
  methodology: {
    Fees: "Total trading fees collected from all swaps on Loxodrome AMM. Fees are 0.05% for volatile pairs and 0.02% for stable pairs. Tracked via 'Fees' events emitted by pool contracts.",
    UserFees: "Fees paid by traders when swapping tokens on the AMM (same as total Fees)",
    Revenue: "Estimated at 85% of total fees (conservative estimate of 80-95% range). This represents fees distributed to veLOXO token holders who vote for liquidity gauges.",
    HoldersRevenue: "Fees earned by veLOXO holders (locked LOXO governance token) through the ve(3,3) voting mechanism. Holders vote for pools and receive trading fees from those pools.",
    ProtocolRevenue: "No fees share for Loxodrome protocol.",
    SupplySideRevenue: "Estimated at 15% of fees. Represents the portion of fees that go to liquidity providers in the pools.",
  }
};

export default adapter;