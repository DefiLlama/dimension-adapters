import { Dependencies, FetchOptions, FetchResultV2 } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { METRIC } from '../../helpers/metrics';
import { getETHReceived } from '../../helpers/token';
import fetchURL from '../../utils/fetchURL';

const PKSTR_TOKEN = '0xc50673EDb3A7b94E8CAD8a7d4E0cD68864E33eDF'

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const commonTokenTreasuryRevenue = options.createBalances();
  const pkstrTokenTreasuryRevenue = options.createBalances();

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
  const commonTokens = Array.from(tokens).filter(token => token != PKSTR_TOKEN)

  // Get ETH received by common tokens (10% tax on swaps)
  await getETHReceived({
    targets: commonTokens,
    balances: commonTokenTreasuryRevenue,
    options
  });

  // Get ETH received by PKSTR token (10% tax on swaps)
  await getETHReceived({
    targets: [PKSTR_TOKEN],
    balances: pkstrTokenTreasuryRevenue,
    options
  });

  // Total fees = all ETH received by all token contracts (80% fee share)
  const dailyFees = options.createBalances();
  dailyFees.addBalances(commonTokenTreasuryRevenue);
  dailyFees.addBalances(pkstrTokenTreasuryRevenue);
  dailyFees.resizeBy(1.2); // to adjust for 80% fee receieved in contract address

  // PKSTR: 10% of tax goes to token-works treasury (protocol revenue)
  // PKSTR: another 10% of tax goes to token-works investors counted as supply side revenue
  const dailyRevenue = await pkstrTokenTreasuryRevenue.clone(0.1);

  // royalty fees(10% of token tax)
  const dailySupplySideRevenue = await commonTokenTreasuryRevenue.clone(0.1);
  dailySupplySideRevenue.addBalances(dailyRevenue);

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue: 0,
  }
}

export default {
  version: 2,
  fetch,
  chains: [CHAIN.ETHEREUM],
  dependencies: [Dependencies.ALLIUM],
  methodology: {
    Fees: '10% buy/sell tax collected from strategy tokens trading from main uni-v4 pools',
    Revenue: '10% of PKSTR token tax goes to token-works team.',
    ProtocolRevenue: '10% of PKSTR token tax goes to token-works team.',
    SupplySideRevenue: '10% of token tax will be distributed to NFT creators as royalty(10% of token tax from PNKSTR Pool goes to token-works investors).',
    HoldersRevenue: 'No holders revenue at the moment.',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.CREATOR_FEES]: '10% token buy/sell tax distributed to NFT creators.',
    }
  },
}


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
