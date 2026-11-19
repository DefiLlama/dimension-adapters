// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 LPStation.
// Submission path: aggregators/lpstation/index.ts
import { coins } from '@defillama/sdk';
import { ethers } from 'ethers';
import { FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { getTransactionsWithRetry, getTxReceiptsWithRetry } from '../../helpers/getTxReceipts';

type Config = { hubs: string[]; start: string; wrapped: string; gasCoin: string; nativeErc20?: string; pendingActivity?: boolean };

// Hub addresses: https://github.com/lpstation/dimension-adapters/blob/add-lpstation-fees/fees/lpstation.ts
// Executor upgrades are discovered
// from each Hub's successful execution event, rather than a mutable address list.
export const chainConfig: Record<string, Config> = {
  [CHAIN.BASE]: { hubs: ['0xc2d1e4678b894b78548e1f8335cd8df4038d4034'], start: '2026-09-21', wrapped: '0x4200000000000000000000000000000000000006', gasCoin: 'ethereum' },
  // Supported by the app, but await a confirmed nonzero mainnet swap sample before listing.
  [CHAIN.BSC]: { hubs: ['0x14b5099aafdc511eb5f3747497bb5fe70c64d0f3'], start: '2026-09-23', wrapped: '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c', gasCoin: 'binancecoin', pendingActivity: true },
  [CHAIN.ARC]: { hubs: ['0x26b8259b6308789e66b4b9f516c5a68768f11027'], start: '2026-09-21', wrapped: '0x3600000000000000000000000000000000000000', gasCoin: 'usd-coin', nativeErc20: '0x3600000000000000000000000000000000000000', pendingActivity: true },
  [CHAIN.HYPERLIQUID]: { hubs: ['0xd5383f2eeca0abf4893b9e8be84865a1f178f1d7'], start: '2026-09-21', wrapped: '0x5555555555555555555555555555555555555555', gasCoin: 'hyperliquid' },
  [CHAIN.ROBINHOOD]: { hubs: ['0x26b8259b6308789e66b4b9f516c5a68768f11027', '0xfd2e63e130dbac76a3df5a4c4e6c5c8bd0026e90'], start: '2026-09-23', wrapped: '0x0bd7d308f8e1639fab988df18a8011f41eacad73', gasCoin: 'ethereum' },
  [CHAIN.AVAX]: { hubs: ['0x14b5099aafdc511eb5f3747497bb5fe70c64d0f3'], start: '2026-09-30', wrapped: '0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7', gasCoin: 'avalanche-2', pendingActivity: true },
  [CHAIN.OPTIMISM]: { hubs: ['0x14b5099aafdc511eb5f3747497bb5fe70c64d0f3'], start: '2026-09-30', wrapped: '0x4200000000000000000000000000000000000006', gasCoin: 'ethereum' },
  [CHAIN.ELYSIUM]: { hubs: ['0x14b5099aafdc511eb5f3747497bb5fe70c64d0f3'], start: '2026-11-12', wrapped: '0xba876237b0f021a6c6d852d6c26e107997cc5e81', gasCoin: 'hyperliquid' },
};

export const EXECUTED = 'event Executed(address indexed user,address indexed executor,bytes32 indexed dstProtocolId,uint256 oldTokenId,uint256 newTokenId,uint128 liquidity)';
export const SHARES_EXECUTED = 'event SharesExecuted(address indexed user,address indexed executor,bytes32 indexed dstProtocolId,uint256 sourceId,uint256 destinationId,uint128 liquidity,bool sourceIsShares,bool destinationIsShares,uint128 sourceShares)';
export const POOL_SWAPPED = 'event Swapped(bytes32 indexed dstProtocol,bool zeroForOne,uint256 amountIn,uint256 amountOut,uint160 sqrtPriceAfter)';
export const KYBER_SWAPPED = 'event Swapped(address sender,address srcToken,address dstToken,address dstReceiver,uint256 spentAmount,uint256 returnAmount)';
export const KYO_SWAPPED = 'event SwapExecuted(address indexed sender,address indexed srcToken,address indexed dstToken,address logic,uint256 amountIn,uint256 amountOut)';

const hubEvents = new ethers.Interface([EXECUTED, SHARES_EXECUTED]);
const poolEvents = new ethers.Interface([POOL_SWAPPED]);
const kyberEvents = new ethers.Interface([KYBER_SWAPPED]);
const kyoEvents = new ethers.Interface([KYO_SWAPPED]);
const ZERO = ethers.ZeroAddress;
const NATIVE = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const LABEL = 'LP swaps';

// Only the external Hub calldata format is needed; no execution implementation.
const PLAN = '(address executor,uint256 deadline,(address token,uint256 amount)[] pulls,(address nft,uint256 tokenId,bytes32 protocolId,bool reinvestFees) src,(address nft,bytes32 protocolId,bytes poolRef,int24 tickLower,int24 tickUpper,uint128 minLiquidity) dst,(uint8 kind,address router,bytes routerData,address tokenIn,address tokenOut,uint256 amountIn,uint256 minOut,bool fixResidual,uint160 sqrtPriceHintX96)[] swaps)';
const PERMIT = '(uint8,uint256,uint256,bytes,uint8,bytes32,bytes32)';
const SHARE = '(bool,bool,uint128)';
const selectors = new Set([
  `execute(${PLAN},${PERMIT})`, `executeWithPermit2(${PLAN},${PERMIT},uint256,bytes)`,
  `executeShares(${PLAN},${PERMIT},${SHARE})`, `executeSharesWithPermit2(${PLAN},${PERMIT},${SHARE},uint256,bytes)`,
].map(signature => ethers.FunctionFragment.from(signature).selector));

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const tokenAddress = (token: string) => same(token, NATIVE) ? ZERO : token.toLowerCase();
const indexOf = (log: any) => Number(log.logIndex ?? log.index);
const hashOf = (log: any) => String(log.transactionHash ?? log.hash).toLowerCase();

export type Swap = { tokenIn: string; tokenOut: string; amountIn: bigint; amountOut: bigint };
type Execution = { hash: string; plan: any; receipt: any };

export function decodeExecution(chain: string, tx: any, receipt: any): Execution {
  if (!tx || !receipt) throw new Error('lpstation: missing transaction or receipt');
  const hash = hashOf(receipt);
  if (hashOf(tx) !== hash) throw new Error(`lpstation: transaction/receipt hash mismatch ${hash}`);
  if (BigInt(receipt.status) !== 1n) throw new Error(`lpstation: unsuccessful execution ${hash}`);
  const config = chainConfig[chain];
  const data: string = tx.input ?? tx.data;
  if (!tx.to || !config.hubs.some(hub => same(hub, tx.to)) || !selectors.has(data?.slice(0, 10))) {
    throw new Error(`lpstation: unsupported indirect Hub call ${hash}`);
  }
  // All four methods place the same dynamic Plan first; trailing permit/share args are irrelevant.
  const plan = ethers.AbiCoder.defaultAbiCoder().decode([PLAN], '0x' + data.slice(10))[0];
  const executions = receipt.logs.filter((log: any) => same(log.address, tx.to))
    .map((log: any) => hubEvents.parseLog(log)).filter(Boolean);
  if (executions.length !== 1 || !same(executions[0].args.executor, plan.executor)
      || !same(executions[0].args.dstProtocolId, plan.dst.protocolId)) {
    throw new Error(`lpstation: execution/plan mismatch ${hash}`);
  }
  return { hash, plan, receipt };
}

export function poolAddress(execution: Execution): string | undefined {
  const ref: string = execution.plan.dst.poolRef;
  if (ethers.dataLength(ref) === 32) return ethers.AbiCoder.defaultAbiCoder().decode(['address'], ref)[0].toLowerCase();
  if (![160, 192].includes(ethers.dataLength(ref))) throw new Error(`lpstation: unknown pool reference ${execution.hash}`);
  return undefined;
}

export function extractSwaps(execution: Execution, v3Tokens?: [string, string]): Swap[] {
  const { plan, receipt, hash } = execution;
  if (!hasSwaps(execution)) return [];
  const ref: string = plan.dst.poolRef;
  const pair = v3Tokens ?? (ethers.dataLength(ref) >= 160
    ? ethers.AbiCoder.defaultAbiCoder().decode(['address', 'address'], ref) : undefined);
  if (!pair) throw new Error(`lpstation: missing pool currencies ${hash}`);
  const pairTokens = [tokenAddress(pair[0]), tokenAddress(pair[1])];
  const swaps: Swap[] = [];
  const used = new Set<number>();
  const logs = [...receipt.logs].sort((a: any, b: any) => indexOf(a) - indexOf(b));
  for (const leg of plan.swaps) {
    if (Number(leg.kind) !== 1) continue;
    const input = tokenAddress(leg.tokenIn);
    let output = tokenAddress(leg.tokenOut);
    if (output === ZERO && input !== ZERO && pairTokens.includes(input)) output = pairTokens[0] === input ? pairTokens[1] : pairTokens[0];
    let found: Swap | undefined;
    for (const log of logs) {
      if (used.has(indexOf(log)) || !same(log.address, leg.router)) continue;
      const parsed = kyberEvents.parseLog(log) ?? kyoEvents.parseLog(log);
      if (!parsed) continue;
      const a = parsed.args;
      if (!same(a.sender, plan.executor) || (a.dstReceiver && !same(a.dstReceiver, plan.executor))) continue;
      if (tokenAddress(a.srcToken) !== input || tokenAddress(a.dstToken) !== output) continue;
      const amountIn = BigInt(a.spentAmount ?? a.amountIn), amountOut = BigInt(a.returnAmount ?? a.amountOut);
      if (amountIn > BigInt(leg.amountIn) || amountOut < BigInt(leg.minOut)) {
        throw new Error(`lpstation: invalid router settlement ${hash}`);
      }
      found = { tokenIn: input, tokenOut: output, amountIn, amountOut };
      used.add(indexOf(log));
      break;
    }
    // An unrecognised router is missing data, never a successful $0-volume result.
    if (!found) throw new Error(`lpstation: unsupported router settlement ${leg.router} in ${hash}`);
    swaps.push(found);
  }
  for (const log of logs) {
    if (!same(log.address, plan.executor)) continue;
    const parsed = poolEvents.parseLog(log);
    if (!parsed) continue;
    const a = parsed.args;
    if (!same(a.dstProtocol, plan.dst.protocolId)) throw new Error(`lpstation: pool swap destination mismatch ${hash}`);
    swaps.push({ tokenIn: pairTokens[a.zeroForOne ? 0 : 1], tokenOut: pairTokens[a.zeroForOne ? 1 : 0], amountIn: BigInt(a.amountIn), amountOut: BigInt(a.amountOut) });
  }
  return swaps;
}

function hasSwaps({ plan, receipt }: Execution): boolean {
  return plan.swaps.some((leg: any) => Number(leg.kind) === 1)
    || receipt.logs.some((log: any) => same(log.address, plan.executor) && log.topics[0] === poolEvents.getEvent('Swapped')!.topicHash);
}

// Net intermediate currencies across one execution: A -> B -> C counts A once.
// Likewise a residual B -> A adjustment reduces, rather than doubles, the initial A -> B trade.
export function netSwapAmounts(chain: string, swaps: Swap[]): Map<string, bigint> {
  const config = chainConfig[chain];
  const net = new Map<string, bigint>();
  const add = (address: string, amount: bigint) => {
    const token = tokenAddress(address);
    const isGas = token === ZERO || same(token, config.wrapped);
    const key = isGas ? `coingecko:${config.gasCoin}` : `${chain}:${token}`;
    // Arc's ERC20 USDC and native USDC are the same asset at 6 and 18 decimals respectively.
    const scaled = config.nativeErc20 && same(token, config.nativeErc20) ? amount * 1_000_000_000_000n : amount;
    net.set(key, (net.get(key) ?? 0n) + scaled);
  };
  for (const swap of swaps) {
    if (swap.amountIn < 0n || swap.amountOut < 0n) throw new Error('lpstation: negative swap amount');
    add(swap.tokenIn, swap.amountIn);
    add(swap.tokenOut, -swap.amountOut);
  }
  return new Map([...net].filter(([, amount]) => amount !== 0n));
}

export function selectVolumeSide(net: Map<string, bigint>, prices: Record<string, any>): [string, bigint][] {
  const input = [...net].filter(([, amount]) => amount > 0n);
  const output = [...net].filter(([, amount]) => amount < 0n).map(([token, amount]) => [token, -amount] as [string, bigint]);
  if (!input.length || !output.length) return []; // no exchange or a round trip that only paid fees
  const priced = (side: [string, bigint][]) => side.every(([token]) => prices[token]?.price > 0 && (prices[token]?.confidence ?? 1) >= 0.5);
  if (priced(input)) return input;
  if (priced(output)) return output;
  throw new Error(`lpstation: neither complete side can be priced (${[...net.keys()].join(', ')})`);
}

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const { hubs } = chainConfig[options.chain];
  const logs = [
    ...await options.getLogs({ targets: hubs, eventAbi: EXECUTED, onlyArgs: false }),
    ...await options.getLogs({ targets: hubs, eventAbi: SHARES_EXECUTED, onlyArgs: false }),
  ];
  const hashes = [...new Set(logs.map(hashOf))];
  const executions: Execution[] = [];
  // Shared helpers batch reads; five hashes at a time cap RPC pressure during historical refills.
  for (let i = 0; i < hashes.length; i += 5) {
    const batch = hashes.slice(i, i + 5);
    const txs = await getTransactionsWithRetry(options.chain, batch);
    const receipts = await getTxReceiptsWithRetry(options.chain, batch);
    for (let j = 0; j < batch.length; j++) executions.push(decodeExecution(options.chain, txs[j], receipts[j]));
  }
  const pools = [...new Set(executions.filter(hasSwaps).map(poolAddress).filter((pool): pool is string => !!pool))];
  const tokens = new Map<string, [string, string]>();
  if (pools.length) {
    const token0 = await options.api.multiCall({ abi: 'address:token0', calls: pools });
    const token1 = await options.api.multiCall({ abi: 'address:token1', calls: pools });
    pools.forEach((pool, i) => tokens.set(pool, [token0[i], token1[i]]));
  }
  const nets = executions.filter(hasSwaps).map(execution => netSwapAmounts(options.chain, extractSwaps(execution, tokens.get(poolAddress(execution) ?? ''))));
  const keys = [...new Set(nets.flatMap(net => [...net.keys()]))];
  if (!keys.length) return { dailyVolume };
  const prices = await coins.getPrices(keys, options.endTimestamp);
  for (const net of nets) {
    for (const [token, amount] of selectVolumeSide(net, prices)) {
      // Native/wrapped aliases have been combined in the chain's 18-decimal gas units.
      if (token.startsWith('coingecko:')) dailyVolume.addGasToken(amount.toString(), LABEL);
      else dailyVolume.addTokenVannila(token, amount.toString(), LABEL);
    }
  }
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: Object.fromEntries(Object.entries(chainConfig).filter(([, config]) => !config.pendingActivity)),
  doublecounted: true, // Aggregator-routed portions also appear in KyberSwap/KYO volume.
  methodology: {
    Volume: 'Value exchanged during LPStation Hub zaps, rebalances and migrations, counting one net side per execution; excludes liquidity deposits, withdrawals, wrapping, direct wallet-to-DEX actions and the standalone swap widget.',
  },
  breakdownMethodology: {
    Volume: { [LABEL]: 'Actual router settlements and pool swaps within each successful Hub execution, netting intermediate currencies and pricing one complete side.' },
  },
};

export default adapter;
