import { FetchOptions } from '../../adapters/types';
import ADDRESSES from '../coreAssets.json';

// Historical settlement registry: https://github.com/routerh/route/blob/main/lib/route/activity.ts
// Keep old emitters for backfills. They are not current approval recommendations.
export const engines = [
  '0xfb866d8cd2796efd920a7a062814aeb88b1d2bcb',
  '0xb1a65445695b79d042caaa86b5aa1e3b5f38ac03',
  '0xd8f7171886f8476ece2e51cffe8c4c637815a815',
  '0x872d8bd2d903f83377c873d3234fb762a4fd4703',
  '0xde02d8438a92084eddff012c0a4673a0832da21d',
  '0x485e249b82587531165ef2fe97a768813964ebd3',
  '0x201a935146e1283f35bb54b8fe7a4c584265b7e8',
  '0x418d76ffa3026fe9e8b067cc39251cca8fcba3f5',
  '0x22c1bba36ba220964d029eb4b1ef7c6ed167e32e',
  '0x70656a2b4a401def17c55687c19c536c0fad4db1',
  '0x9990a63ef329ab407956b4fe5a812aba0d81e20c',
];
// Exact source: https://repo.sourcify.dev/4663/0xBFADcf357545cb185420eAD0fDE1008A289c0154
export const collector = '0xbfadcf357545cb185420ead0fde1008a289c0154';
export const settled = 'event Settled(address indexed sender,address indexed recipient,address indexed tokenOut,uint256 grossAmountOut,uint256 feeBps,uint256 feeAmount,uint256 amountOut)';
export const swapEvents = [
  'event Swapped(address indexed sender,address indexed recipient,address indexed tokenIn,address tokenOut,uint256 amountIn,uint256 amountOut)',
  'event Swapped(address indexed sender,address indexed recipient,address indexed tokenIn,address tokenOut,uint256 amountIn,uint256 amountOut,bytes32 routeHash)',
  'event Swapped(address indexed sender,address indexed recipient,address indexed tokenIn,address tokenOut,uint256 amountIn,uint256 amountOut,address intermediate,address firstAdapter,uint24 firstFee,address secondAdapter,uint24 secondFee)',
];
export const feePaid = 'event FeePaid(address indexed sender,address indexed recipient,address indexed token,uint256 grossAmountOut,uint256 feeAmount)';

export function addToken(balance: ReturnType<FetchOptions['createBalances']>, token: string, amount: string, label: string) {
  if (token.toLowerCase() === ADDRESSES.null) balance.addGasToken(amount, label);
  else balance.add(token, amount, label);
}

// Count a single, preferentially priceable side. Never price long-tail tokens at $1.
export function volumeSide(log: any): [string, string] {
  const preferred = [ADDRESSES.robinhood.USDG, ADDRESSES.null, ADDRESSES.robinhood.WETH].map(x => x.toLowerCase());
  for (const token of preferred) {
    if (log.tokenIn.toLowerCase() === token) return [log.tokenIn, log.amountIn.toString()];
    if (log.tokenOut.toLowerCase() === token) return [log.tokenOut, log.amountOut.toString()];
  }
  return [log.tokenIn, log.amountIn.toString()];
}
