import ADDRESSES from '../../helpers/coreAssets.json';
import { ethers } from 'ethers';
import { FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { getTxReceiptsWithRetry } from '../../helpers/getTxReceipts';
import { addOneToken } from '../../helpers/prices';

const chainConfig: Record<string, { hubs: string[]; wrapped: string; start: string }> = {
  [CHAIN.BASE]: { hubs: ['0xc2d1e4678b894b78548e1f8335cd8df4038d4034'], wrapped: ADDRESSES.base.WETH, start: '2026-09-21' },
  [CHAIN.HYPERLIQUID]: { hubs: ['0xd5383f2eeca0abf4893b9e8be84865a1f178f1d7'], wrapped: ADDRESSES.hyperliquid.WHYPE, start: '2026-09-21' },
  [CHAIN.ROBINHOOD]: { hubs: ['0x26b8259b6308789e66b4b9f516c5a68768f11027', '0xfd2e63e130dbac76a3df5a4c4e6c5c8bd0026e90'], wrapped: ADDRESSES.robinhood.WETH, start: '2026-09-23' },
  [CHAIN.OPTIMISM]: { hubs: ['0x14b5099aafdc511eb5f3747497bb5fe70c64d0f3'], wrapped: ADDRESSES.optimism.WETH_1, start: '2026-09-30' },
  [CHAIN.ELYSIUM]: { hubs: ['0x14b5099aafdc511eb5f3747497bb5fe70c64d0f3'], wrapped: ADDRESSES.elysium.WHYPE, start: '2026-11-12' },
};

const EXECUTED = 'event Executed(address indexed user, address indexed executor, bytes32 indexed dstProtocolId, uint256 oldTokenId, uint256 newTokenId, uint128 liquidity)';
const SHARES_EXECUTED = 'event SharesExecuted(address indexed user, address indexed executor, bytes32 indexed dstProtocolId, uint256 sourceId, uint256 destinationId, uint128 liquidity, bool sourceIsShares, bool destinationIsShares, uint128 sourceShares)';

const routerSwapEvents = new ethers.Interface([
  'event Swapped(address sender, address srcToken, address dstToken, address dstReceiver, uint256 spentAmount, uint256 returnAmount)', // KyberSwap
  'event SwapExecuted(address indexed sender, address indexed srcToken, address indexed dstToken, address logic, uint256 amountIn, uint256 amountOut)', // KYO
]);

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const { hubs, wrapped } = chainConfig[options.chain];
  const executions = [
    ...await options.getLogs({ targets: hubs, eventAbi: EXECUTED, onlyArgs: false }),
    ...await options.getLogs({ targets: hubs, eventAbi: SHARES_EXECUTED, onlyArgs: false }),
  ];
  const executorByTx = new Map<string, string>();
  executions.forEach((log: any) => executorByTx.set(log.transactionHash.toLowerCase(), log.args.executor.toLowerCase()));

  const hashes = [...executorByTx.keys()];
  const receipts = await getTxReceiptsWithRetry(options.chain, hashes);
  const toWrapped = (token: string) => [ADDRESSES.null, ADDRESSES.GAS_TOKEN_2].includes(token.toLowerCase()) ? wrapped : token;

  receipts.forEach((receipt, i) => {
    if (!receipt) throw new Error(`lpstation: missing receipt ${hashes[i]}`);
    for (const log of receipt.logs) {
      const swap = routerSwapEvents.parseLog(log);
      if (!swap) continue;
      const [sender, tokenIn, tokenOut, , amountIn, amountOut] = swap.args;
      if (sender.toLowerCase() !== executorByTx.get(hashes[i])) continue;
      addOneToken({ chain: options.chain, balances: dailyVolume, token0: toWrapped(tokenIn), amount0: amountIn, token1: toWrapped(tokenOut), amount1: amountOut });
    }
  });

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  doublecounted: true,
  methodology: {
    Volume: 'KyberSwap and KYO router swaps made inside LPStation Hub zaps, rebalances and migrations, counting the core-asset side of each swap.',
  },
};

export default adapter;
