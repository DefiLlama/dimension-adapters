import { FetchOptions } from '../../adapters/types';
import { getProvider } from '@defillama/sdk';
import { Interface, zeroPadValue } from 'ethers';
import { getTransactionsWithRetry } from '../../helpers/getTxReceipts';

// https://sentry.trading/abis/ink/SentryInkRouterV4.json
// This immutable router emits no fee event. Buys forward their exact ETH fee
// before wrapping the remaining input; sells unwrap actual WETH proceeds and
// forward the contract's fee from that settlement (not pool swap notional).
export async function nativeRouterFees(options: FetchOptions, router: string, weth: string) {
  const lower = (s: string) => s.toLowerCase();
  const wrapped = new Interface(['event Deposit(address indexed dst,uint256 wad)', 'event Withdrawal(address indexed src,uint256 wad)']);
  const routerAbi = new Interface(['function buyExactEthForTokens(address token,uint256 minOut,address recipient) payable returns(uint256)']);
  const buySelector = routerAbi.getFunction('buyExactEthForTokens')!.selector;
  const deposits = new Map<string, bigint[]>();
  const logs = await options.getLogs({ target: weth, topics: [[wrapped.getEvent('Deposit')!.topicHash, wrapped.getEvent('Withdrawal')!.topicHash], zeroPadValue(router, 32)], fromBlock: (await options.getFromBlock()) + 1, toBlock: await options.getToBlock(), maxBlockRange: 9900, entireLog: true });
  if (!logs.length) return 0n;
  const feeBps = BigInt(await options.api.call({ target: router, abi: 'uint256:FEE_BPS' }));
  const treasury = lower(await options.api.call({ target: router, abi: 'address:treasury' }));
  let total = 0n;
  for (const log of logs) {
    const event = wrapped.parseLog(log)!;
    if (event.name === 'Withdrawal') total += BigInt(event.args.wad) * feeBps / 10000n;
    else {
      const amounts = deposits.get(log.transactionHash) ?? [];
      amounts.push(BigInt(event.args.wad)); deposits.set(log.transactionHash, amounts);
    }
  }
  const hashes = [...deposits.keys()];
  for (let i = 0; i < hashes.length; i += 5) {
    const batch = hashes.slice(i, i + 5), txs = await getTransactionsWithRetry(options.chain, batch);
    for (let j = 0; j < batch.length; j++) {
      const hash = batch[j], tx = txs[j], amounts = deposits.get(hash)!;
      if (!tx) throw new Error(`Missing router transaction ${hash}`);
      if (lower(tx.to ?? '') === lower(router) && (tx.data ?? '').startsWith(buySelector) && amounts.length === 1) {
        const fee = BigInt(tx.value) * feeBps / 10000n;
        if (BigInt(tx.value) - fee !== amounts[0]) throw new Error(`Router fee/deposit mismatch in ${hash}`);
        total += fee;
      } else {
        // Smart-account/aggregator buys need the individual CALL value, not the
        // top-level transaction value. Use successful call traces and verify
        // their deposits; never estimate a missing nested payment as zero.
        const provider: any = getProvider(options.chain);
        if (provider._isReady) await provider._isReady;
        const senders = provider.rpcs?.map((p: any) => p.provider) ?? [provider];
        let trace: any;
        for (const sender of senders) {
          try { trace = await sender.send('debug_traceTransaction', [hash, { tracer: 'callTracer' }]); break; }
          catch { /* Try another configured RPC; fail below if none supports traces. */ }
        }
        if (!trace) throw new Error(`A callTracer-capable RPC is required for nested Sentry router payment ${hash}`);
        const tracedDeposits: bigint[] = [];
        let tracedFees = 0n;
        const walk = (call: any) => {
          if (call.error) return;
          if (lower(call.to ?? '') === lower(router) && (call.input ?? '').startsWith(buySelector)) {
            const gross = BigInt(call.value ?? 0), expected = gross * feeBps / 10000n;
            const paid = (call.calls ?? []).filter((c: any) => !c.error && c.type === 'CALL' && lower(c.to ?? '') === treasury && (!c.input || c.input === '0x')).reduce((s: bigint, c: any) => s + BigInt(c.value ?? 0), 0n);
            if (paid !== expected) throw new Error(`Nested router fee mismatch in ${hash}`);
            tracedFees += paid; tracedDeposits.push(gross - paid);
          }
          (call.calls ?? []).forEach(walk);
        };
        walk(trace);
        if (tracedDeposits.length !== amounts.length || tracedDeposits.some((amount, n) => amount !== amounts[n])) throw new Error(`Nested router deposit mismatch in ${hash}`);
        total += tracedFees;
      }
    }
  }
  return total;
}
