import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from '../helpers/chains';
import { ICurveDexConfig, ContractVersion, getCurveDexData } from "../helpers/curve";

const METRIC = {
  SWAP_FEES: 'Token Swap Fees',
  PROTOCOL_REVENUE: 'Swap Fees To Protocol',
  HOLDERS_REVENUE: 'Swap Fees To Holders',
  LP_REVENUE: 'Swap Fees To Liquidity Providers',
  BUY_BACK_AND_BURN: 'Buy Back And Burn CAKE',
}

// pools discovered via pairLength()/swapPairContract(i) — factory lacks Curve's pool_count/pool_list
const PancakeStableswapConfigs: { [chain: string]: { start: string; factory: string } } = {
  [CHAIN.BSC]: { start: '2020-09-06', factory: '0x25a55f9f2279a54951133d503490342b50e5cd15' },
  [CHAIN.ETHEREUM]: { start: '2024-07-25', factory: '0xD173bf0851D2803177CC3928CF52F7b6bd29D054' },
  [CHAIN.ARBITRUM]: { start: '2024-01-11', factory: '0x5D5fBB19572c4A89846198c3DBEdB2B6eF58a77a' },
};

async function getStableSwapPools(options: FetchOptions, factory: string): Promise<Array<string>> {
  const pairLength = await options.api.call({ target: factory, abi: 'uint256:pairLength' });
  return options.api.multiCall({
    target: factory,
    abi: 'function swapPairContract(uint256) view returns (address)',
    calls: Array.from({ length: Number(pairLength) }, (_, i) => i),
  });
}

async function fetch(options: FetchOptions) {
  const { start, factory } = PancakeStableswapConfigs[options.chain];
  const pools = await getStableSwapPools(options, factory);
  const config: ICurveDexConfig = { start, customPools: { [ContractVersion.crypto]: pools } };

  const { dailyVolume, swapFees, adminFees } = await getCurveDexData(options, config)

  const dailyRevenue = options.createBalances()
  dailyRevenue.add(adminFees.clone(0.2), METRIC.PROTOCOL_REVENUE) // 10% of swap fees → treasury
  dailyRevenue.add(adminFees.clone(0.8), METRIC.HOLDERS_REVENUE) // 40% of swap fees → CAKE buyback

  const lpFees = swapFees.clone(1)
  lpFees.subtract(adminFees)

  return {
    dailyVolume,
    dailyFees: swapFees.clone(1, METRIC.SWAP_FEES),
    dailyRevenue,
    dailyProtocolRevenue: adminFees.clone(0.2, METRIC.PROTOCOL_REVENUE),
    dailySupplySideRevenue: lpFees.clone(1, METRIC.LP_REVENUE),
    dailyHoldersRevenue: adminFees.clone(0.8, METRIC.BUY_BACK_AND_BURN),
  };
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: Object.fromEntries(
    Object.entries(PancakeStableswapConfigs).map(([chain, cfg]) => [chain, { fetch, start: cfg.start }])
  ),
  methodology: {
    UserFees: "Traders pay each pool's configured swap fee, read on-chain per pool (ranges roughly 0.01%–0.25%).",
    Fees: "Total swap fees charged to traders, using each pool's on-chain fee rate.",
    Revenue: "Half of the swap fees (the pool admin fee); the other half stays with liquidity providers.",
    ProtocolRevenue: "Treasury keeps 10% of swap fees (20% of the admin fee).",
    SupplySideRevenue: "Liquidity providers keep 50% of swap fees (the non-admin half).",
    HoldersRevenue: "40% of swap fees (80% of the admin fee) funds CAKE buyback and burn.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.SWAP_FEES]: "Each pool's on-chain swap fee applied to trade volume.",
    },
    Revenue: {
      [METRIC.PROTOCOL_REVENUE]: 'Treasury keeps 10% of swap fees.',
      [METRIC.HOLDERS_REVENUE]: '40% of swap fees funds CAKE buyback and burn.',
    },
    ProtocolRevenue: {
      [METRIC.PROTOCOL_REVENUE]: 'Treasury keeps 10% of swap fees.',
    },
    SupplySideRevenue: {
      [METRIC.LP_REVENUE]: 'Liquidity providers keep 50% of swap fees.',
    },
    HoldersRevenue: {
      [METRIC.BUY_BACK_AND_BURN]: '40% of swap fees funds CAKE buyback and burn.',
    },
  }
};

export default adapter;
