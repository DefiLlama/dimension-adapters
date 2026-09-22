import { ChainApi } from '@defillama/sdk';
import { FetchOptions } from '../adapters/types';

// Production deployments (including the still-open first factory):
// https://genius.fun/contracts/manifest.json
// https://bscscan.com/address/0x78EAE9537C0ef90DFe9B7ae964682Fe8138afe31#code
// https://bscscan.com/address/0x37eE8AeE29C5efd3C1A7edA6dF3F510779928a37#code
export const deployments = [
  { factory: '0x78EAE9537C0ef90DFe9B7ae964682Fe8138afe31', hook: '0xFf17F41c5Efd6CCe944Af0912F300097D62df5c9', fromBlock: 122266653 },
  { factory: '0x37eE8AeE29C5efd3C1A7edA6dF3F510779928a37', hook: '0x8E6f8eBbD62B60085B703C40B460daE802eDC51b', fromBlock: 122874918 },
];

export const start = '2026-09-16';
export const nativeToken = '0x0000000000000000000000000000000000000000';
export const policyTuple = '(uint16 destinationBps,uint16 platformBps,uint16 creatorBps,uint16 buybackBps,address foundationVault)';
// SDK forwards this supported option to abi.multiCall; its ChainApi type omits
// the field. Fifty calls stay below public BSC providers' encoded payload cap.
export const multicallOptions = { chunkSize: 50 };
export const events = {
  launch: 'event TokenLaunched(address indexed token,address indexed curve,address indexed deployer,address pairToken,uint256 launchConfigId,uint256 graduationThreshold)',
  launchFee: 'event LaunchFeeUpdated(uint256 launchFee)',
  buy: 'event CurveBuy(address indexed buyer,address indexed recipient,uint256 quoteIn,uint256 tokensOut,uint256 fee,uint256 tax)',
  sell: 'event CurveSell(address indexed seller,address indexed recipient,uint256 tokensIn,uint256 quoteOut,uint256 fee,uint256 tax)',
  hookFee: 'event HookFeeCollected(bytes32 indexed poolId,address currency,uint256 feeAmount,uint256 taxAmount)',
  swap: 'event Swap(bytes32 indexed id,address indexed sender,int128 amount0,int128 amount1,uint160 sqrtPriceX96,uint128 liquidity,int24 tick,uint24 fee,uint16 protocolFee)',
  alpha: 'event AlphaPromoted(address indexed token,address indexed payer,uint256 paidWei)',
};

export type EventLog = {
  address: string;
  blockNumber: number;
  logIndex?: number;
  index?: number;
  transactionHash: string;
  args: any;
};

export type FeePolicy = {
  destinationBps: string;
  platformBps: string;
  creatorBps: string;
  buybackBps: string;
  foundationVault: string;
};

export const lower = (value: string) => value.toLowerCase();
export const logIndex = (log: EventLog) => {
  const index = log.logIndex ?? log.index;
  if (index === undefined) throw new Error('Genius.fun: log index missing');
  return index;
};
export const logOrder = (a: EventLog, b: EventLog) => a.blockNumber - b.blockNumber || logIndex(a) - logIndex(b);

// getFromBlock is the snapshot preceding this interval. Excluding it prevents
// adjacent hourly windows from counting the same boundary block twice.
export async function period(options: FetchOptions) {
  return { fromBlock: (await options.getFromBlock()) + 1, toBlock: await options.getToBlock() };
}

export async function getCurveTrades(options: FetchOptions) {
  const range = await period(options);
  const live = deployments.filter(deployment => deployment.fromBlock <= range.toBlock && range.fromBlock <= range.toBlock);
  const launches: EventLog[] = live.length ? await options.getLogs({
    targets: live.map(deployment => deployment.factory),
    eventAbi: events.launch,
    fromBlock: Math.min(...live.map(deployment => deployment.fromBlock)),
    toBlock: range.toBlock,
    entireLog: true, parseLog: true, cacheInCloud: true,
  }) : [];
  const byCurve = new Map(launches.map(log => [lower(log.args.curve), log]));
  const targets = [...byCurve.keys()];
  const readTrades = async (eventAbi: string) => {
    if (!targets.length) return [] as EventLog[];
    const logs: EventLog[] = await options.getLogs({ targets, eventAbi, ...range, entireLog: true, parseLog: true });
    return logs.filter(log => byCurve.has(lower(log.address)));
  };
  const buys = await readTrades(events.buy);
  const sells = await readTrades(events.sell);
  return { range, launches, byCurve, buys, sells };
}

export async function getCurvePolicies(options: FetchOptions, curves: string[]) {
  // Keep encoded multicall requests below public BSC providers' payload limits.
  const policies: FeePolicy[] = await options.api.multiCall({ ...multicallOptions, abi: `function foundationFeePolicy() view returns (${policyTuple})`, calls: curves });
  const destinations: boolean[] = await options.api.multiCall({ ...multicallOptions, abi: 'bool:toFoundation', calls: curves });
  return new Map(curves.map((curve, index) => [lower(curve), { policy: policies[index], toFoundation: destinations[index] }]));
}

// Match FoundationFeeMath.split: integer rounding belongs to the creator.
// CurveBuy.fee already includes the launch-window snipe surcharge; its separate
// SnipeTaxCharged event is informational and must not be counted again.
export function splitFee(fee: bigint, tax: bigint, policy: FeePolicy) {
  const destinationBps = BigInt(policy.destinationBps);
  const platformBps = BigInt(policy.platformBps);
  const buybackBps = BigInt(policy.buybackBps);
  const total = destinationBps + platformBps + buybackBps + BigInt(policy.creatorBps);
  if (total === 0n) {
    // A 4.2 launch can retain a snipe surcharge with a zero ordinary policy.
    // Its sweep assigns the unallocated quoteFeeBalance residual to the creator.
    return { destination: 0n, platform: 0n, creator: fee + tax, buyback: 0n };
  }
  const destination = fee * destinationBps / total;
  const platform = fee * platformBps / total;
  const buyback = fee * buybackBps / total;
  return { destination, platform, buyback, creator: fee - destination - platform - buyback + tax };
}
