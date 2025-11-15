import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { FetchOptions, FetchResultV2 } from "../../adapters/types";

// Loxodrome has two products:
// 1. Loxodrome AMM (this adapter) - Spot trading DEX with liquidity pools
// 2. Loxodrome Perp (separate adapter) - Perpetual futures trading
//
// Factory: 0x92bfa051bf12a0aef9a5e1ac8b2aa7dc1b05a406 (main AMM factory)
// Secondary Factory: 0x9442E8d017bb3dC2Ba35d75204211e60f86fF0F8 (additional pools)
// Fee Structure: 0.05% on volatile pairs, 0.02% on stable pairs
// Revenue Model: ~90% of fees go to veLOXO holders (ve(3,3) tokenomics)

const FACTORY_ADDRESSES = [
  '0x92bfa051bf12a0aef9a5e1ac8b2aa7dc1b05a406',
  '0x9442E8d017bb3dC2Ba35d75204211e60f86fF0F8'
];

const fetch = async ({ api, createBalances, getLogs }: FetchOptions): Promise<FetchResultV2> => {
  const dailyFees = createBalances();

  // Get all liquidity pool pairs from both factories
  const allPairs: string[] = [];
  const allToken0s: string[] = [];
  const allToken1s: string[] = [];

  for (const factory of FACTORY_ADDRESSES) {
    const lpTokens = await api.fetchList({ 
      lengthAbi: 'uint256:allPairsLength', 
      itemAbi: 'function allPairs(uint256) view returns (address)', 
      target: factory 
    });

    const [token0s, token1s] = await Promise.all([
      api.multiCall({ abi: 'address:token0', calls: lpTokens }),
      api.multiCall({ abi: 'address:token1', calls: lpTokens })
    ]);

    allPairs.push(...lpTokens);
    allToken0s.push(...token0s);
    allToken1s.push(...token1s);
  }

  const feesLogs = await getLogs({
    targets: allPairs,
    flatten: false,
    eventAbi: 'event Fees (address indexed sender, uint256 amount0, uint256 amount1)'
  });

  // Sum up all trading fees
  allPairs.forEach((_: string, index: number) => {
    const token0 = allToken0s[index];
    const token1 = allToken1s[index];
    feesLogs[index].forEach((log: any) => {
      dailyFees.add(token0, log.amount0);
      dailyFees.add(token1, log.amount1);
    });
  });

  // According to Loxodrome docs: 80-95% of trading fees distributed to veLOXO voters
  // Using conservative 85% for revenue calculation
  const totalFees = await dailyFees.getUSDValue();
  const holdersRevenue = totalFees * 0.85;

  return {
    dailyFees,
    dailyRevenue: holdersRevenue,
    dailyHoldersRevenue: holdersRevenue, // Revenue distributed to veLOXO stakers/voters
    dailySupplySideRevenue: totalFees * 0.15, // ~15% to LPs
  };
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
    Revenue: "Estimated at 85% of total fees (conservative estimate of 80-95% range). This represents fees distributed to veLOXO token holders who vote for liquidity gauges.",
    HoldersRevenue: "Fees earned by veLOXO holders (locked LOXO governance token) through the ve(3,3) voting mechanism. Holders vote for pools and receive trading fees from those pools.",
    SupplySideRevenue: "Estimated at 15% of fees. Represents the portion of fees that go to liquidity providers in the pools.",
    UserFees: "Fees paid by traders when swapping tokens on the AMM (same as total Fees)"
  }
};

export default adapter;