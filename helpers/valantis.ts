import { ChainApi } from '@defillama/sdk';
import { Interface } from 'ethers';
import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from './chains';

// Deployment/code boundaries verified on HyperEVM, chain 999.
// https://github.com/ValantisLabs/valantis-stex-khype/blob/main/src/STEXAMM.sol
export const WHYPE = '0x5555555555555555555555555555555555555555';
export const OVERSEER = '0xB96f07367e69e86d6e9C3F29215885104813eeAE';
export const ESCROW = '0x0447d0339c82a8EFe01994b7D1981bf5c517da0e';
// First PoolManagerFeeSet blocks and launch exceptions are documented in docs/valantis/README.md.
export const products = {
  sthype: { stex: '0x39694eFF3b02248929120c73F90347013Aec834d', pool: '0x5365b6EF09253C7aBc0A9286eC578A9f4B413B7D', token0: '0xfFaa4a3D97fE9107Cef8a3F48c069F577Ff76cC1', block: 1937868, managerFeeStartBlock: 1937930, start: '2025-04-02' },
  khype: { stex: '0xbf747D2959F03332dbd25249dB6f00F62c6Cb526', pool: '0x88B214eC94276B825E641820D5C97a9042F9Dd60', token0: '0xfD739d4e423301CE9385c1fb8850539D657C296D', block: 7773262, managerFeeStartBlock: 8134100, start: '2025-07-07' },
};
type Product = typeof products.sthype;
const BPS = 10000n;
export const events = {
  swap: 'event Swap(address indexed sender,bool isZeroToOne,uint256 amountIn,uint256 fee,uint256 amountOut)',
  managerFee: 'event PoolManagerFeeSet(uint256 poolManagerFeeBips)',
  withdrawalModule: 'event WithdrawalModuleSet(address withdrawalModule)',
  withdraw: 'event Withdraw(address indexed sender,address indexed recipient,uint256 amountToken0,uint256 amountToken1,uint256 shares)',
  transfer: 'event Transfer(address indexed from,address indexed to,uint256 value)',
  poolWithdraw: 'event WithdrawLiquidity(address indexed recipient,uint256 amount0,uint256 amount1)',
  lendingWithdraw: 'event AmountWithdrawnFromLendingModule(uint256 amount)',
};
const iface = new Interface(Object.values(events));
const zero = '0x0000000000000000000000000000000000000000';
const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const index = (log: any) => Number(log.logIndex ?? log.index);
const position = (a: any, b: any) => Number(a.blockNumber) - Number(b.blockNumber) || index(a) - index(b);

/** Smallest gross spread consistent with the actual, rounded manager fee. */
export function withdrawalFees(manager: bigint, managerBps: bigint) {
  if (manager < 0n || managerBps <= 0n || managerBps > BPS) throw new Error('Cannot reconstruct STEX withdrawal fees at this manager share');
  // Contract: manager = floor(spread * managerBps / 10000).
  // This lower bound undercounts by at most ceil(10000/managerBps)-1 wei:
  // at the observed 20% share, at most 4 wei of HYPE per withdrawal.
  const fees = (manager * BPS + managerBps - 1n) / managerBps;
  return { fees, revenue: manager, supplySide: fees - manager };
}

/** Match funding after the LP burn and before this invocation's final event. */
export function managerFromReceipt(logs: any[], withdrawal: any, product: Product, module: string) {
  const end = index(withdrawal);
  const decoded = iface.parseLog(withdrawal)!.args;
  const before = logs.filter(l => index(l) < end).sort((a, b) => index(a) - index(b));
  let start = -1;
  for (const log of before) {
    if (eq(log.address, product.stex) && log.topics[0] === iface.getEvent('Withdraw')!.topicHash) start = -1;
    if (!eq(log.address, product.stex) || log.topics[0] !== iface.getEvent('Transfer')!.topicHash) continue;
    const a = iface.parseLog(log)!.args;
    if (eq(a.to, zero) && eq(a.from, decoded.sender) && a.value === decoded.shares) start = index(log);
  }
  if (start < 0) throw new Error('STEX withdrawal has no matching LP burn');
  let funding = 0n;
  for (const log of before.filter(l => index(l) > start)) {
    if (eq(log.address, product.pool) && log.topics[0] === iface.getEvent('WithdrawLiquidity')!.topicHash) {
      const a = iface.parseLog(log)!.args;
      if (eq(a.recipient, product.stex)) funding += BigInt(a.amount1);
    } else if (module && eq(log.address, module) && log.topics[0] === iface.getEvent('AmountWithdrawnFromLendingModule')!.topicHash) {
      funding += BigInt(iface.parseLog(log)!.args.amount);
    }
  }
  const manager = funding - BigInt(decoded.amountToken1);
  if (manager < 0n) throw new Error('STEX withdrawal funding does not reconcile');
  return manager;
}

/** Inclusive RPC ranges need explicit timestamp checks on their boundary blocks. */
export async function windowBounds(options: FetchOptions) {
  const from = await options.getFromBlock(), to = await options.getToBlock();
  if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < 1 || to < from) throw new Error('Invalid Valantis window blocks');
  const first = await options.api.provider.getBlock(from), last = from === to ? first : await options.api.provider.getBlock(to);
  if (!first || !last) throw new Error('Missing Valantis window boundary block');
  // The runner resolves (fromTimestamp, toTimestamp], ending at HH:59:59.
  // Express that as [fromTimestamp + 1, endTimestamp), otherwise the prior
  // hour's final second is counted in both hourly slots.
  const start = options.fromTimestamp + 1;
  return { from, to, includes: (log: any) => {
    const block = Number(log.blockNumber);
    const timestamp = block === from ? first.timestamp : block === to ? last.timestamp : undefined;
    return block >= from && block <= to && (timestamp === undefined || (timestamp >= start && timestamp < options.endTimestamp));
  } };
}

export function stexAdapter(product: Product): SimpleAdapter {
  const fetch = async (options: FetchOptions) => {
    const dailyVolume = options.createBalances(), dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances(), dailySupplySideRevenue = options.createBalances();
    const bounds = await windowBounds(options);
    if (bounds.to < product.block) return { dailyVolume, dailyFees, dailyUserFees: dailyFees.clone(), dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone(), dailySupplySideRevenue };
    const opening = new ChainApi({ chain: options.chain, block: bounds.from - 1 });
    let managerBps = bounds.from <= product.block ? 0n : BigInt(await opening.call({ target: product.pool, abi: 'uint256:poolManagerFeeBips' }));
    const swaps = await options.getLogs({ target: product.pool, eventAbi: events.swap, onlyArgs: false });
    const updates = await options.getLogs({ target: product.pool, eventAbi: events.managerFee, onlyArgs: false });
    // Non-instant exits with zero token0 payout are harmless candidates: their
    // funding exactly equals the user payout, giving zero manager/gross fees.
    const withdrawals = (await options.getLogs({ target: product.stex, eventAbi: events.withdraw, onlyArgs: false }))
      .filter(l => bounds.includes(l) && BigInt(l.args.amountToken0) === 0n);
    const modules = withdrawals.length ? await options.getLogs({ target: product.stex, eventAbi: events.withdrawalModule, onlyArgs: false }) : [];
    let module = withdrawals.length ? await new ChainApi({ chain: options.chain, block: Math.max(bounds.from - 1, product.block) })
      .call({ target: product.stex, abi: 'address:withdrawalModule', skipCache: true }) : '';
    const byTx = new Map<string, { log: any; managerBps: bigint; module: string }[]>();
    const ordered = [...swaps.map(l => ({ ...l, kind: 'swap' })), ...updates.map(l => ({ ...l, kind: 'rate' })),
      ...modules.map(l => ({ ...l, kind: 'module' })), ...withdrawals.map(l => ({ ...l, kind: 'withdraw' }))].sort(position);
    for (const log of ordered) {
      if (log.kind === 'rate') { managerBps = BigInt(log.args.poolManagerFeeBips); continue; }
      if (log.kind === 'module') { module = log.args.withdrawalModule; continue; }
      if (!bounds.includes(log)) continue;
      if (managerBps < 0n || managerBps > BPS) throw new Error('Invalid STEX swap manager share');
      if (log.kind === 'withdraw') {
        const hash = log.transactionHash;
        if (!hash) throw new Error('STEX withdrawal is missing transaction hash');
        if (!byTx.has(hash)) byTx.set(hash, []);
        byTx.get(hash)!.push({ log, managerBps, module });
        continue;
      }
      const a = log.args, token = a.isZeroToOne ? product.token0 : WHYPE;
      const fee = BigInt(a.fee), revenue = fee * managerBps / BPS;
      dailyVolume.add(token, a.amountIn.toString()); // One gross input leg only.
      dailyFees.add(token, fee.toString(), 'Swap Fees');
      dailyRevenue.add(token, revenue.toString(), 'Swap Fees To Valantis');
      dailySupplySideRevenue.add(token, (fee - revenue).toString(), 'Swap Fees To LPs');
    }
    // One receipt per distinct candidate transaction; no execution traces.
    for (const [hash, wanted] of byTx) {
      const receipt = await options.api.getTransactionReceipt(hash);
      if (!receipt || Number(receipt.status) !== 1) throw new Error(`Missing successful STEX receipt ${hash}`);
      for (const { log, managerBps, module } of wanted) {
        const withdrawal = receipt.logs.find(l => eq(l.address, product.stex) && l.topics[0] === iface.getEvent('Withdraw')!.topicHash && index(l) === index(log));
        if (!withdrawal || withdrawal.data !== log.data || withdrawal.topics.join() !== log.topics.join()) throw new Error(`Indexed STEX withdrawal does not match receipt ${hash}:${index(log)}`);
        const revenue = managerFromReceipt(receipt.logs, withdrawal, product, module);
        // Verified launch history: stHYPE had no withdrawals before its first
        // manager-fee setup; kHYPE had two HYPE-only exits with no LST exposure
        // (blocks 8037281 / 8126199), hence zero conversion spread. Never extend
        // this exception to a later zero-manager-share period.
        if (managerBps === 0n && revenue === 0n && Number(log.blockNumber) < product.managerFeeStartBlock) continue;
        const amounts = withdrawalFees(revenue, managerBps);
        dailyFees.add(WHYPE, amounts.fees.toString(), 'Instant Withdrawal Fees');
        dailyRevenue.add(WHYPE, amounts.revenue.toString(), 'Instant Withdrawal Fees To Valantis');
        dailySupplySideRevenue.add(WHYPE, amounts.supplySide.toString(), 'Instant Withdrawal Fees To LPs');
      }
    }
    return { dailyVolume, dailyFees, dailyUserFees: dailyFees.clone(), dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone(), dailySupplySideRevenue };
  };
  return {
    version: 2, pullHourly: true, chains: [CHAIN.HYPERLIQUID], start: product.start, fetch,
    methodology: {
      Volume: 'Gross input-side volume of swaps in this STEX pool; excludes LP withdrawals and keeper operations.',
      Fees: 'Actual swap fees plus conservatively reconstructed instant-withdrawal fees, rounded down by at most 4 HYPE wei per withdrawal at a 20% manager share.',
      UserFees: 'Swap fees and conservatively reconstructed instant-withdrawal fees paid by users; excludes LP withdrawal principal.',
      Revenue: 'The execution-time manager share of swap and instant-withdrawal fees retained by Valantis.',
      ProtocolRevenue: 'The execution-time manager share of swap and instant-withdrawal fees accrued to Valantis-controlled recipients.',
      SupplySideRevenue: 'Swap and conservatively reconstructed instant-withdrawal fees remaining for LPs after the exact Valantis manager share.',
    },
    breakdownMethodology: {
      Fees: { 'Swap Fees': 'Fees emitted by this trading pool.', 'Instant Withdrawal Fees': 'Smallest spread consistent with the receipt-derived manager fee and historical on-chain manager share.' },
      Revenue: { 'Swap Fees To Valantis': 'Swap manager share using ordered on-chain rate changes.', 'Instant Withdrawal Fees To Valantis': 'Exact requested pool/lending funding less the matched user payout.' },
      ProtocolRevenue: { 'Swap Fees To Valantis': 'Swap manager share allocated to Valantis.', 'Instant Withdrawal Fees To Valantis': 'Instant-withdrawal manager share allocated to Valantis.' },
      SupplySideRevenue: { 'Swap Fees To LPs': 'Swap fees less the manager share.', 'Instant Withdrawal Fees To LPs': 'Conservatively reconstructed instant-conversion spread less the exact manager share.' },
      UserFees: { 'Swap Fees': 'Fees paid by traders.', 'Instant Withdrawal Fees': 'Conservatively reconstructed fees paid for instant conversion on LP exit.' },
    },
  };
}
