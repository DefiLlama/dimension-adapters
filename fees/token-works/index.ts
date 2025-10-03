import { FetchOptions, FetchResultV2 } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { METRIC } from '../../helpers/metrics';

const PunkStreategy = '0xfAaad5B731F52cDc9746F2414c823eca9B06E844';
const TokenWorksHook = '0xe3C63A9813Ac03BE0e8618B627cb8170cfA468c4';
const UniswapPositionManager = '0xbd216513d74c8cf14cf4747e6aaa6420ff64ee9e';

const Abis = {
  HookFee: 'event HookFee(bytes32 indexed id, address indexed sender, uint128 feeAmount0, uint128 feeAmount1)',
  poolKeys: 'function poolKeys(bytes25) view returns(address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks)',
}

function getPoolKey(poolId: string): string {
  return poolId.slice(0, 52);
}

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const feeEvents = await options.getLogs({
    targets: [TokenWorksHook, PunkStreategy],
    eventAbi: Abis.HookFee,
    flatten: true,
  });

  const uniswapV4Pools: {[key: string]: any} = {}
  for (const feeEvent of feeEvents) {
    uniswapV4Pools[feeEvent.id] = null;
  }

  const poolIds: Array<string> = Object.keys(uniswapV4Pools);

  const poolKeys = await options.api.multiCall({
    abi: Abis.poolKeys,
    calls: poolIds.map(poolId => {
      return {
        target: UniswapPositionManager,
        params: [getPoolKey(poolId)],
      }
    }),
    permitFailure: false,
  })
  for (let i = 0; i < poolIds.length; i++) {
    uniswapV4Pools[poolIds[i]] = {
      currency0: poolKeys[i].currency0,
      currency1: poolKeys[i].currency1,
    }
  }

  // ETH-PNKSTR pool
  uniswapV4Pools['0xbdb0f9c31367485f85e691f638345f3de673a78effaff71ce34bc7ff1d54fddc'] = {
    currency0: '0x0000000000000000000000000000000000000000',
    currency1: '0xc50673EDb3A7b94E8CAD8a7d4E0cD68864E33eDF',
  }

  for (const feeEvent of feeEvents) {
    const totalFee0 = Math.abs(Number(feeEvent.feeAmount0));
    const totalFee1 = Math.abs(Number(feeEvent.feeAmount1));

    dailyFees.add(uniswapV4Pools[feeEvent.id].currency0, totalFee0 * 0.9, METRIC.TOKEN_BUY_BACK);
    dailyFees.add(uniswapV4Pools[feeEvent.id].currency1, totalFee1 * 0.9, METRIC.TOKEN_BUY_BACK);
    dailyFees.add(uniswapV4Pools[feeEvent.id].currency0, totalFee0 * 0.1, METRIC.CREATOR_FEES);
    dailyFees.add(uniswapV4Pools[feeEvent.id].currency1, totalFee1 * 0.1, METRIC.CREATOR_FEES);

    dailyRevenue.add(uniswapV4Pools[feeEvent.id].currency0, totalFee0 * 0.9, METRIC.TOKEN_BUY_BACK);
    dailyRevenue.add(uniswapV4Pools[feeEvent.id].currency1, totalFee1 * 0.9, METRIC.TOKEN_BUY_BACK);

    dailySupplySideRevenue.add(uniswapV4Pools[feeEvent.id].currency0, totalFee0 * 0.1, METRIC.CREATOR_FEES);
    dailySupplySideRevenue.add(uniswapV4Pools[feeEvent.id].currency1, totalFee1 * 0.1, METRIC.CREATOR_FEES);
  }

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: 0, // no launch fees for now
    dailySupplySideRevenue,
    dailyHoldersRevenue: dailyRevenue,
  }
}

export default {
  version: 2,
  fetch,
  chains: [CHAIN.ETHEREUM],
  methodology: {
    Fees: 'Launch fees + total buy/sell tax collected from strategy tokens trading (not including swap fees on dexes).',
    Revenue: 'All buy/sell tax are revenue, they will be shared for creators and token buy back.',
    ProtocolRevenue: 'Fees charged when launch strategy tokens on TokenWorks, currently no launch fees.',
    SupplySideRevenue: '10% of token tax will be distributed to NFT creators.',
    HoldersRevenue: '90% of token tax and all NFT saled will be use to buy back strategy tokens.',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.TOKEN_BUY_BACK]: '90% token buy/sell tax will be used to buy back strategy tokens.',
      [METRIC.CREATOR_FEES]: '10% token buy/sell tax distributed to NFT creators.',
    },
    Revenue: {
      [METRIC.TOKEN_BUY_BACK]: '90% token buy/sell tax will be used to buy back strategy tokens.',
    },
    SupplySideRevenue: {
      [METRIC.CREATOR_FEES]: '10% token buy/sell tax distributed to NFT creators.',
    },
    ProtocolRevenue: {
      [METRIC.TOKEN_BUY_BACK]: '90% token buy/sell tax will be used to buy back strategy tokens.',
    },
    HoldersRevenue: {
      [METRIC.TOKEN_BUY_BACK]: '90% token buy/sell tax will be used to buy back strategy tokens.',
    },
  },
}
