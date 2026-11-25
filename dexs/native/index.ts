import type { FetchOptions, FetchV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addOneToken } from "../../helpers/prices";

// v1 pools: days before 2024-09-12 are stored from Native's retired analytics API
const V1_START = '2024-09-12';
// v1 pools stopped on 2025-03-07 and Native has no RFQ deployment on these chains
const V1_END = '2025-03-08';

const chainConfig: Record<string, { start: number | string; deadFrom?: string; v1Pools?: string[] }> = {
  [CHAIN.BSC]: { start: V1_START, v1Pools: ['0x56385da1f6d17185402fe21795e0593837c8e991', '0xbd0180f7365a354b3b857c0ab16377c7bcdd2ec9'] },
  [CHAIN.ETHEREUM]: { start: 21627898 },
  [CHAIN.ARBITRUM]: { start: V1_START, v1Pools: ['0xf6b94770608ebf8b9b7621378cde5bc04b431cc8'] },
  [CHAIN.AVAX]: { start: V1_START, deadFrom: V1_END, v1Pools: ['0xbd0180f7365a354b3b857c0ab16377c7bcdd2ec9'] },
  [CHAIN.POLYGON]: { start: V1_START, deadFrom: V1_END, v1Pools: ['0x45b69fd499f068b7306d743d2f8b2ad5c54d99a0'] },
  [CHAIN.BASE]: { start: 25970577 },
  [CHAIN.XLAYER]: { start: 61994385 },
  [CHAIN.ROBINHOOD]: { start: 60423 },
};

const RFQ_TRADE_EVENT = 'event RFQTrade(address recipient, address sellerToken, address buyerToken, uint256 sellerTokenAmount, uint256 buyerTokenAmount, bytes16 quoteId, address signer)';
const V1_POOL_SWAP_EVENT = 'event Swap(address indexed sender, address indexed recipient, address tokenIn, address tokenOut, int256 amountIn, int256 amountOut, uint256 fee, bytes16 quoteId)';

const fetch: FetchV2 = async (options: FetchOptions) => {
  const { getLogs, createBalances, chain } = options;
  const dailyVolume = createBalances();
  const { v1Pools } = chainConfig[chain];

  const [rfqLogs, v1Logs] = await Promise.all([
    getLogs({ noTarget: true, eventAbi: RFQ_TRADE_EVENT }),
    v1Pools ? getLogs({ targets: v1Pools, eventAbi: V1_POOL_SWAP_EVENT }) : [],
  ]);

  rfqLogs.forEach((log: any) => {
    dailyVolume.add(log.buyerToken, log.buyerTokenAmount);
  });

  v1Logs.forEach((log: any) => {
    addOneToken({ balances: dailyVolume, token0: log.tokenIn, amount0: log.amountIn, token1: log.tokenOut, amount1: log.amountOut });
  });

  return {
    dailyVolume,
  };
}

const methodology = {
  Volume: 'Value of swaps filled by Native market makers: the tokens traders receive in each RFQ trade, plus swaps against Native v1 pools until March 2025, valued on their core-asset side. Native v1 router swaps sent on to outside DEXs are not counted.',
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  methodology,
  adapter: chainConfig as any,
};

export default adapter;
