import request, { gql } from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { isCoreAsset } from "../helpers/prices";

const chainConfig: any = {
  [CHAIN.ETHEREUM]: {
    endpoint: "https://api-explore-ring-production.up.railway.app",
    poolManager: "0x000000000004444c5dc75cB358380D2e3dE08A90",
    start: "2025-02-01",
  },
};

const swapEvent = "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)";

const poolsQuery = gql`
  query ringV4Pools($limit: Int!, $offset: Int!) {
    v4Pools(limit: $limit, offset: $offset) {
      totalCount
      items {
        poolId
        token0 {
          address
          originToken {
            address
          }
        }
        token1 {
          address
          originToken {
            address
          }
        }
      }
    }
  }
`;

const poolsCache: Record<string, Promise<Record<string, string[]>> | undefined> = {};

async function getPools(endpoint: string) {
  return poolsCache[endpoint] ??= (async () => {
    const pools: Record<string, string[]> = {}, limit = 100;

    for (let offset = 0; ; offset += limit) {
      const { v4Pools: { items, totalCount } }: any = await request(endpoint, poolsQuery, { limit, offset });

      items.forEach(({ poolId, token0, token1 }: any) => {
        pools[poolId.toLowerCase()] = [token0, token1].map(t => (t.originToken?.address || t.address).toLowerCase());
      })

      if (offset + items.length >= totalCount || items.length < limit) return pools;
    }
  })();
}

async function fetch(options: FetchOptions) {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const { endpoint, poolManager } = chainConfig[options.chain];
  const pools = await getPools(endpoint);

  const events = await options.getLogs({
    target: poolManager,
    eventAbi: swapEvent,
  });

  events.forEach((event: any) => {
    const pool = pools[String(event.id).toLowerCase()];
    if (!pool) return;

    const pricedSide = isCoreAsset(options.chain, pool[0]) ? 0 : 1;
    const token = pool[pricedSide];
    const rawAmount = BigInt(pricedSide === 0 ? event.amount0 : event.amount1);
    const amount = rawAmount < 0n ? -rawAmount : rawAmount;
    const fees = amount * BigInt(event.fee) / 1000000n

    dailyVolume.add(token, amount);
    dailyFees.add(token, fees, "Swap Fees");
    dailySupplySideRevenue.add(token, fees, "Swap Fees To LPs");

  });

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: 0,
    dailySupplySideRevenue,
  };
}
const methodology = {
  Volume: "Volume is calculated from ring pool swap logs.",
  Fees: "Fees are calculated from swap logs using each swap's fee tier.",
  UserFees: "Users pay swap fees on each trade.",
  Revenue: "Ring does not currently take protocol revenue from these v4 pools.",
  SupplySideRevenue: "All swap fees are treated as liquidity provider revenue.",
};

const breakdownMethodology = {
  Fees: {
    "Swap Fees": "Swap fees paid by users on Ring v4 pools.",
  },
  UserFees: {
    "Swap Fees": "Swap fees paid by users on Ring v4 pools.",
  },
  SupplySideRevenue: {
    "Swap Fees To LPs": "Swap fees distributed to liquidity providers.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  doublecounted: true, //Ring Pools are Uniswap-V4 based custom pools
  methodology,
  breakdownMethodology,
  fetch,
  adapter: chainConfig,
};

export default adapter;
