// HSR partial KyberSwap attribution candidate. No confirmed HSR Mainnet sample yet.
// Proposed Base scope only; other supported application networks are not claimed.
// Router source and event ABI:
// https://github.com/KyberNetwork/ks-dex-aggregation-router-v2-sc/blob/954cba76592896132c54900cc7cf82242615d1bb/src/MetaAggregationRouterV2.sol
// Base verified deployment/code: https://basescan.org/address/0x6131B5fae19EA4f9D964eAc0408E4408b66337b5#code
import type { FetchOptions, SimpleAdapter } from '../adapters/types';
import { getProvider } from '@defillama/sdk';
import { Interface, keccak256 } from 'ethers';
/** Normalized evidence, independent of viem/ethers and usable by both adapters. */
export type KyberEvidence = {
  chainId: number;
  hash: string;
  receiptHash: string;
  blockNumber: string;
  blockHash: string;
  canonicalHash: string;
  finalized: boolean;
  timestamp: number;
  router: string;
  codeHash: string;
  expectedCodeHash: string;
  success: boolean;
  from: string;
  to: string | null;
  value: string;
  source: string;
  input: {
    tokenIn: string;
    tokenOut: string;
    amount: string;
    minimum: string;
    recipient: string;
  };
  events: {
    sender: string;
    tokenIn: string;
    tokenOut: string;
    recipient: string;
    spent: string;
    received: string;
    logIndex: number;
  }[];
  clientEvents: string[];
};
export type KyberVolumeRecord = {
  chainId: number;
  hash: string;
  blockNumber: string;
  blockHash: string;
  timestamp: number;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  logIndex: number;
};
export type KyberVerification =
  | { status: 'verified'; record: KyberVolumeRecord }
  | { status: 'pending' | 'excluded'; reason: string };
const same = (a: string | null, b: string) =>
  a?.toLowerCase() === b.toLowerCase();
const uint = (s: string) => /^(0|[1-9][0-9]{0,77})$/.test(s);
export function attributeKyber(e: KyberEvidence): KyberVerification {
  const exclude = (reason: string): KyberVerification => ({
    status: 'excluded',
    reason,
  });
  if (!e.success) return exclude('reverted');
  if (!same(e.hash, e.receiptHash) || !same(e.to, e.router))
    return exclude('wrong-transaction');
  if (!same(e.blockHash, e.canonicalHash))
    return { status: 'pending', reason: 'reorg' };
  if (!e.finalized) return { status: 'pending', reason: 'not-finalized' };
  if (!same(e.codeHash, e.expectedCodeHash))
    return exclude('router-code-changed');
  if (e.source !== 'hsr') return exclude('other-source');
  // Direct router tx only. Multiple swaps/tags may be nested executor calls:
  // never attribute every swap in a tx just because one tag says hsr.
  if (
    e.events.length !== 1 ||
    e.clientEvents.length !== 1 ||
    e.clientEvents[0] !== 'hsr'
  )
    return exclude('ambiguous-events');
  const s = e.events[0]!;
  if (
    !Number.isSafeInteger(s.logIndex) ||
    s.logIndex < 0 ||
    !Number.isSafeInteger(e.timestamp) ||
    e.timestamp < 0 ||
    !/^[0-9]+$/.test(e.blockNumber)
  )
    return exclude('invalid-position');
  if (
    !same(s.sender, e.from) ||
    !same(s.recipient, e.input.recipient) ||
    !same(s.tokenIn, e.input.tokenIn) ||
    !same(s.tokenOut, e.input.tokenOut)
  )
    return exclude('event-input-mismatch');
  if (
    ![s.spent, s.received, e.input.amount, e.input.minimum].every(uint) ||
    BigInt(s.spent) <= 0n ||
    BigInt(s.spent) > BigInt(e.input.amount) ||
    BigInt(s.received) <= 0n ||
    BigInt(s.received) < BigInt(e.input.minimum)
  )
    return exclude('invalid-amounts');
  const native = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
  if (
    !uint(e.value) ||
    (s.tokenIn.toLowerCase() === native
      ? BigInt(e.value) !== BigInt(e.input.amount)
      : BigInt(e.value) !== 0n)
  )
    return exclude('wrong-value');
  return {
    status: 'verified',
    record: {
      chainId: e.chainId,
      hash: e.hash.toLowerCase(),
      blockNumber: e.blockNumber,
      blockHash: e.blockHash.toLowerCase(),
      timestamp: e.timestamp,
      tokenIn: s.tokenIn.toLowerCase(),
      tokenOut: s.tokenOut.toLowerCase(),
      amountIn: s.spent,
      amountOut: s.received,
      logIndex: s.logIndex,
    },
  };
}


type Deployment = {
  chainId: number;
  router: string;
  codeHash: string;
  inputs: string[];
};
const deployments: Record<string, Deployment> = {
  base: {
    chainId: 8453,
    router: '0x6131B5fae19EA4f9D964eAc0408E4408b66337b5',
    codeHash:
      '0x99590941aab8e1eaf2ceb825abf64b6956e82ce41e8966d7e320846905db85e3',
    inputs: [
      '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      '0x4200000000000000000000000000000000000006',
      '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
      '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf',
      '0x940181a94a35a4569e4529a3cdfb74e38fd98631',
      '0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b',
      '0xc1cba3fcea344f92d9239c08c0568f6f2f0ee452',
      '0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22',
      '0x60a3e35cc302bfa44cb288bc5a4f316fdb1adb42',
      '0x50c5725949a6f0c72e6c4a641f24049a917db0cb',
      '0x820c137fa70c8691f0e44dc420a5e53c168921dc',
      '0x6bb7a212910682dcfdbd5bcbb3e28fb4e8da10ee',
      '0x5d3a1ff2b6bab83b63cd9ad0787074081a52ef34',
      '0x04c0599ae5a44757c0af6f9ec3b93da8976c150a',
      '0x2416092f143378750bb29b79ed961ab195cceea5',
      '0x236aa50979d5f3de3bd1eeb40e81137f22ab794b',
      '0x532f27101965dd16442e59d40670faf5ebb142e4',
      '0x4ed4e862860bed51a9570b96d89af5e1b0efefed',
    ],
  },
};
const abi = new Interface([
  'function swap((address callTarget,address approveTarget,bytes targetData,(address srcToken,address dstToken,address[] srcReceivers,uint256[] srcAmounts,address[] feeReceivers,uint256[] feeAmounts,address dstReceiver,uint256 amount,uint256 minReturnAmount,uint256 flags,bytes permit) desc,bytes clientData) execution) payable returns(uint256,uint256)',
  'event ClientData(bytes clientData)',
  'event Swapped(address sender,address srcToken,address dstToken,address dstReceiver,uint256 spentAmount,uint256 returnAmount)',
]);
function sourceOf(data: string): string {
  if (!/^0x[0-9a-f]*$/i.test(data) || data.length > 8194) return '';
  try {
    const body: unknown = JSON.parse(
      Buffer.from(data.slice(2), 'hex').toString('utf8'),
    );
    return body &&
      typeof body === 'object' &&
      'Source' in body &&
      typeof body.Source === 'string'
      ? body.Source
      : '';
  } catch {
    return '';
  }
}
type RawReceipt = {
  status: number | string;
  hash?: string;
  transactionHash?: string;
  blockNumber: number;
  blockHash: string;
  logs: {
    address: string;
    data: string;
    topics: string[];
    index?: number;
    logIndex?: string | number;
  }[];
};
type RawTransaction = {
  from: string;
  to: string | null;
  data?: string;
  input?: string;
  value: bigint | string;
  blockHash: string;
};
async function fetch(options: FetchOptions) {
  const config = deployments[options.chain];
  if (!config) throw Error('Unsupported HSR chain');
  const provider = getProvider(options.chain);
  let finalized = await provider.getBlock('finalized');
  // SDK RPC rotation may return a stale finalized head. Retry bounded fresh reads;
  // never turn an interval not covered by finalized evidence into a zero row.
  for (let retry = 0; retry < 2 && (!finalized || finalized.timestamp < options.endTimestamp); retry++)
    finalized = await provider.getBlock('finalized');
  if (!finalized || finalized.timestamp < options.endTimestamp)
    throw Error('Requested interval is not finalized');
  const dailyVolume = options.createBalances();
  const tags = await options.getLogs({
    target: config.router,
    eventAbi: 'event ClientData(bytes clientData)',
    onlyArgs: false,
  });
  const seen = new Set<string>();
  for (const tag of tags) {
    const data =
      tag.args?.clientData ??
      (tag.data && tag.topics
        ? abi.parseLog({ data: tag.data, topics: tag.topics })?.args.clientData
        : undefined);
    if (typeof data !== 'string')
      throw Error('ClientData log is missing raw evidence');
    if (sourceOf(data) !== 'hsr') continue;
    const hash = tag.transactionHash?.toLowerCase();
    if (!/^0x[0-9a-f]{64}$/.test(hash))
      throw Error('Missing HSR transaction hash');
    if (seen.has(hash)) continue;
    seen.add(hash);
    const receipt = (await provider.getTransactionReceipt(
      hash,
    )) as unknown as RawReceipt | null;
    const tx = (await provider.getTransaction(
      hash,
    )) as unknown as RawTransaction | null;
    if (!receipt || !tx) throw Error('Missing HSR receipt/transaction');
    if (Number(receipt.status) !== 1) continue;
    // Smart-wallet/multicall attribution is deliberately excluded.
    if (tx.to?.toLowerCase() !== config.router.toLowerCase()) continue;
    const block = await provider.getBlock(receipt.blockNumber);
    if (!block) throw Error('Missing HSR block');
    if (
      block.timestamp < options.startTimestamp ||
      block.timestamp >= options.endTimestamp
    )
      continue;
    const calldata = tx.data ?? tx.input;
    if (!calldata) throw Error('Missing transaction calldata');
    const call = abi.parseTransaction({ data: calldata });
    if (!call || call.name !== 'swap')
      throw Error('Unsupported HSR router call');
    const execution = call.args[0];
    const events = [];
    const clientEvents: string[] = [];
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== config.router.toLowerCase()) continue;
      const event = abi.parseLog({ data: log.data, topics: [...log.topics] });
      if (event?.name === 'ClientData')
        clientEvents.push(sourceOf(event.args.clientData));
      if (event?.name === 'Swapped')
        events.push({
          sender: event.args.sender,
          tokenIn: event.args.srcToken,
          tokenOut: event.args.dstToken,
          recipient: event.args.dstReceiver,
          spent: event.args.spentAmount.toString(),
          received: event.args.returnAmount.toString(),
          logIndex: Number(log.index ?? log.logIndex),
        });
    }
    const code = await provider.getCode(config.router, receipt.blockNumber);
    // SDK 5 LlamaProvider.getBlock performs a new HTTP RPC read (no ethers cache).
    const canonical = await provider.getBlock(receipt.blockNumber);
    if (
      !canonical?.hash ||
      tx.blockHash !== receipt.blockHash ||
      block.hash !== receipt.blockHash
    )
      throw Error('HSR canonical block unavailable or changed');
    const proof = attributeKyber({
      chainId: config.chainId,
      hash,
      receiptHash: receipt.hash ?? receipt.transactionHash ?? '',
      blockNumber: receipt.blockNumber.toString(),
      blockHash: receipt.blockHash,
      canonicalHash: canonical.hash,
      finalized: receipt.blockNumber <= finalized.number,
      timestamp: block.timestamp,
      router: config.router,
      codeHash: keccak256(code),
      expectedCodeHash: config.codeHash,
      success: true,
      from: tx.from,
      to: tx.to,
      value: BigInt(tx.value).toString(),
      source: sourceOf(execution.clientData),
      input: {
        tokenIn: execution.desc.srcToken,
        tokenOut: execution.desc.dstToken,
        amount: execution.desc.amount.toString(),
        minimum: execution.desc.minReturnAmount.toString(),
        recipient: execution.desc.dstReceiver,
      },
      events,
      clientEvents,
    });
    if (proof.status === 'pending')
      throw Error('HSR receipt is not canonical/finalized');
    if (proof.status !== 'verified')
      throw Error('Ambiguous HSR attribution: ' + proof.reason);
    const record = proof.record;
    if (!config.inputs.includes(record.tokenIn))
      throw Error('HSR input asset not covered by checked registry');
    if (record.tokenIn === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee')
      dailyVolume.addGasToken(record.amountIn, 'KyberSwap-tagged swaps');
    else
      dailyVolume.add(
        record.tokenIn,
        record.amountIn,
        'KyberSwap-tagged swaps',
      );
  }
  return { dailyVolume };
}
const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  doublecounted: true,
  adapter: Object.fromEntries(Object.keys(deployments).map((chain) => [chain, {}])),
  fetch,
  methodology: {
    Volume:
      'Finalized direct KyberSwap router swaps with exact ClientData.Source=hsr; actual input spent counted once. Direct-DEX HSR routes and smart-wallet/multicall transactions excluded. Public source tag is not cryptographic website identity. Volume overlaps KyberSwap/underlying DEX volume.',
  },
  breakdownMethodology: {
    Volume: {
      'KyberSwap-tagged swaps':
        'Input amounts from matched Swapped and ClientData events, checked against direct transaction calldata, receipt, pinned router bytecode and canonical finalized block. USD prices supplied by DefiLlama, never from ClientData.',
    },
  },
};

export default adapter;
