import { FetchOptions, FetchResultV2 } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { METRIC } from '../../helpers/metrics';
import { getETHReceived } from '../../helpers/token';
import fetchURL from '../../utils/fetchURL';
// import ADDRESSES from '../../helpers/coreAssets.json';
// import { ethers } from 'ethers';

// const PunkStreategy = '0xfAaad5B731F52cDc9746F2414c823eca9B06E844';
// const TokenWorksHook = '0xe3C63A9813Ac03BE0e8618B627cb8170cfA468c4';
// const UniswapPositionManager = '0xbd216513d74c8cf14cf4747e6aaa6420ff64ee9e';

// const UNISWAP_POOL_MANAGER = "0x000000000004444c5dc75cB358380D2e3dE08A90";
// const SWAP_TOPIC = '0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f';

// const ABI = {
//   HookFee: 'event HookFee(bytes32 indexed id, address indexed sender, uint128 feeAmount0, uint128 feeAmount1)',
//   SWAP_EVENT: 'event Swap (bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)',
//   poolKeys: 'function poolKeys(bytes25) view returns(address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks)',
// }

// function getPoolKey(poolId: string): string {
//   return poolId.slice(0, 52);
// }

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const tokenTreasuryRevenue = options.createBalances();

  const strategies: { name: string, id: string, hook: string, poolId: string, tokenAddress: string, collection: string }[] = [];
  const strategiesres = await fetchURL('https://www.nftstrategy.fun/api/strategies');

  for (const strategy of strategiesres) {
    strategies.push({
      id: strategy.id,
      name: strategy.collectionName,
      hook: strategy.hook,
      poolId: strategy.poolId,
      tokenAddress: strategy.tokenAddress,
      collection: strategy.collection
    });
  }

  const tokens = new Set(strategies.map(strategy => strategy.tokenAddress));
  await getETHReceived({
    targets: Array.from(tokens),
    balances: tokenTreasuryRevenue,
    options
  });

  const dailyFees = tokenTreasuryRevenue.clone(1/0.8, METRIC.TOKEN_BUY_BACK);
  const dailyRevenue = dailyFees.clone(0.9, METRIC.TOKEN_BUY_BACK);
  const dailySupplySideRevenue = dailyFees.clone(0.1, METRIC.CREATOR_FEES);

  // Not using below code because of token-works hook bug
  // https://x.com/0xSLK/status/1975602712185114978

  // for (const strategy of STRATEGIES) {
  //   const tradeFeeLogs = await options.getLogs({
  //     target: UNISWAP_POOL_MANAGER,
  //     topics: [
  //       SWAP_TOPIC,
  //       strategy.poolId,
  //       ethers.zeroPadValue(strategy.hook, 32)
  //     ],
  //     eventAbi: ABI.SWAP_EVENT
  //   });

  //   tradeFeeLogs.forEach((trade: any) => {
  //     dailyFees.add(ADDRESSES.ethereum.WETH, trade.amount0)
  //   });
  // }

  // const hook_set = new Set(STRATEGIES.map(strategy => strategy.hook));
  // const feeEvents = await options.getLogs({
  //   targets: Array.from(hook_set),
  //   eventAbi: ABI.HookFee,
  //   flatten: true,
  // });

  // const uniswapV4Pools: {[key: string]: any} = {}
  // for (const strategy of STRATEGIES)   {
  //   uniswapV4Pools[strategy.poolId] = {
  //     currency0: '0x0000000000000000000000000000000000000000',
  //     currency1: strategy.tokenAddress,
  //   }
  // }

  // for (const feeEvent of feeEvents) {
  //   const totalFee0 = Math.abs(Number(feeEvent.feeAmount0));
  //   const totalFee1 = Math.abs(Number(feeEvent.feeAmount1));
  //   // if (totalFee0 > 0) {
  //   //   continue;
  //   // }
  //   dailyFees.add(uniswapV4Pools[feeEvent.id].currency0, totalFee0 * 0.9, METRIC.TOKEN_BUY_BACK);
  //   dailyFees.add(uniswapV4Pools[feeEvent.id].currency1, totalFee1 * 0.9, METRIC.TOKEN_BUY_BACK);
  //   dailyFees.add(uniswapV4Pools[feeEvent.id].currency0, totalFee0 * 0.1, METRIC.CREATOR_FEES);
  //   dailyFees.add(uniswapV4Pools[feeEvent.id].currency1, totalFee1 * 0.1, METRIC.CREATOR_FEES);

  //   dailyRevenue.add(uniswapV4Pools[feeEvent.id].currency0, totalFee0 * 0.9, METRIC.TOKEN_BUY_BACK);
  //   dailyRevenue.add(uniswapV4Pools[feeEvent.id].currency1, totalFee1 * 0.9, METRIC.TOKEN_BUY_BACK);

  //   dailySupplySideRevenue.add(uniswapV4Pools[feeEvent.id].currency0, totalFee0 * 0.1, METRIC.CREATOR_FEES);
  //   dailySupplySideRevenue.add(uniswapV4Pools[feeEvent.id].currency1, totalFee1 * 0.1, METRIC.CREATOR_FEES);
  // }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: 0,
    dailySupplySideRevenue,
    dailyHoldersRevenue: dailyRevenue,
  }
}

export default {
  version: 2,
  fetch,
  chains: [CHAIN.ETHEREUM],
  methodology: {
    Fees: 'Total buy/sell tax collected from strategy tokens trading (not including swap fees on dexes).',
    Revenue: '90% of token tax will be used for buybacks and burns.',
    ProtocolRevenue: 'No launch fees.',
    SupplySideRevenue: '10% of token tax will be distributed to NFT creators.',
    HoldersRevenue: '90% of token tax and all NFT sold will be used to buy back strategy tokens.',
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
