import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getTransactionsWithRetry, getTxReceiptsWithRetry } from "../../helpers/getTxReceipts";

// TRNCH (https://www.trnch.fun) is a memecoin card game on Robinhood Chain whose swap screen routes trades
// through LI.FI, KyberSwap, 0x and Uniswap. Every swap is executed by the router's own contract, so this
// listing is double counted with those routers' listings.

// Robinhood Chain contracts
// LI.FI diamond: helpers/aggregators/lifi.ts (LifiDiamonds), lifinance/contracts deployments
export const LIFI_DIAMOND = '0xB477751B76CF82d00a686A1232f5fCD772414Af3';
// KyberSwap MetaAggregationRouterV2, `to` of TRNCH swaps, e.g. 0x59d5c8341924f1a2f988b6b86f29dae534ffbaec8407e6aa44ae32209c9f4134
export const KYBER_ROUTER = '0x6131B5fae19EA4f9D964eAc0408E4408b66337b5';
// 0x AllowanceHolder (Cancun), returned as allowance target by the 0x Swap API on Robinhood Chain
export const ZEROX_ALLOWANCE_HOLDER = '0x0000000000001fF3684f28c67538d4D072C22734';
// Uniswap Universal Router, returned by the Uniswap Trading API on Robinhood Chain
export const UNISWAP_UNIVERSAL_ROUTER = '0x8876789976dEcBfCbBbe364623C63652db8C0904';
// TRNCH treasury Safe (SafeL2 v1.5.0): the fee recipient TRNCH passes to every router
export const TRNCH_TREASURY_SAFE = '0xe1F2aBa69cfD0C6973d037426D4391FE64b2Fc2e';

// integrator id TRNCH sends to LI.FI, and `source` it sends to KyberSwap (written to ClientData)
export const TRNCH_INTEGRATOR = 'trnch';
// first TRNCH-tagged swap on-chain: 2026-09-22 (UTC), none on 2026-09-21
export const TRNCH_START = '2026-09-22';

const NULL_ADDRESS = '0x0000000000000000000000000000000000000000';
const KYBER_NATIVE = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

export const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const LifiSwapEvent = 'event LiFiGenericSwapCompleted(bytes32 indexed transactionId, string integrator, string referrer, address receiver, address fromAssetId, address toAssetId, uint256 fromAmount, uint256 toAmount)';
const KyberSwappedEvent = 'event Swapped(address sender, address srcToken, address dstToken, address dstReceiver, uint256 spentAmount, uint256 returnAmount)';
const KyberClientDataEvent = 'event ClientData(bytes clientData)';
const TransferEvent = 'event Transfer(address indexed from, address indexed to, uint256 value)';
const SafeReceivedEvent = 'event SafeReceived(address indexed sender, uint256 value)';

// Routers whose swaps carry no TRNCH id on-chain: a swap is attributed to TRNCH when the transaction sent to
// the router pays a fee to the TRNCH treasury Safe in the same transaction.
export type FeeRouter = 'kyberswap' | '0x' | 'uniswap';
export const FEE_ROUTERS: Record<string, FeeRouter> = {
  [KYBER_ROUTER.toLowerCase()]: 'kyberswap',
  [ZEROX_ALLOWANCE_HOLDER.toLowerCase()]: '0x',
  [UNISWAP_UNIVERSAL_ROUTER.toLowerCase()]: 'uniswap',
};

export const padAddress = (address: string) => '0x' + address.slice(2).toLowerCase().padStart(64, '0');
export const normalizeToken = (token: string) => {
  const t = String(token).toLowerCase();
  return t === KYBER_NATIVE ? NULL_ADDRESS : t;
};
const sameAddress = (a: any, b: string) => typeof a === 'string' && a.toLowerCase() === b.toLowerCase();
const logIndexOf = (log: any) => Number(log.logIndex ?? log.index ?? -1);
const isTrnchTag = (value: any) => typeof value === 'string' && value.trim().toLowerCase() === TRNCH_INTEGRATOR;

export type RouterFeePayment = { hash: string; router: FeeRouter; from: string; value: bigint; fees: { token: string; amount: bigint }[] };

// Fees paid to the treasury Safe inside transactions sent to KyberSwap, 0x or Uniswap.
// ERC-20: Transfer to the Safe (any token, so no target list; the public RPC caps address-less queries at
// 30k blocks). ETH: SafeReceived, emitted by the Safe on every native transfer it receives.
// Payments to the Safe from any other transaction (LI.FI fee claims, own-wallet transfers) are ignored here.
export async function getRouterFeePayments(options: FetchOptions): Promise<RouterFeePayment[]> {
  const [tokenIn, ethIn] = await Promise.all([
    options.getLogs({ noTarget: true, eventAbi: TransferEvent, topics: [TRANSFER_TOPIC, null as any, padAddress(TRNCH_TREASURY_SAFE)], entireLog: true, maxBlockRange: 30000 }),
    options.getLogs({ target: TRNCH_TREASURY_SAFE, eventAbi: SafeReceivedEvent, entireLog: true }),
  ]);
  const byTx = new Map<string, { token: string; amount: bigint }[]>();
  const push = (hash: string, token: string, amount: any) => {
    const key = String(hash).toLowerCase();
    const list = byTx.get(key) ?? [];
    list.push({ token: normalizeToken(token), amount: BigInt(amount) });
    byTx.set(key, list);
  };
  for (const log of tokenIn) push(log.transactionHash, log.address, log.args.value);
  for (const log of ethIn) push(log.transactionHash, NULL_ADDRESS, log.args.value);
  if (!byTx.size) return [];

  const hashes = [...byTx.keys()];
  const txs = await getTransactionsWithRetry(options.chain, hashes);
  const payments: RouterFeePayment[] = [];
  hashes.forEach((hash, i) => {
    const tx: any = txs[i];
    if (!tx) throw new Error(`trnch: transaction ${hash} not found`);
    const router = tx.to ? FEE_ROUTERS[tx.to.toLowerCase()] : undefined;
    if (!router) return;
    payments.push({ hash, router, from: tx.from.toLowerCase(), value: BigInt(tx.value ?? 0), fees: byTx.get(hash)! });
  });
  return payments;
}

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  // LI.FI: same-chain swaps tagged with the TRNCH integrator id, counted on the input leg
  const lifiSwaps = await options.getLogs({ target: LIFI_DIAMOND, eventAbi: LifiSwapEvent, maxBlockRange: 100000 });
  for (const log of lifiSwaps) {
    if (isTrnchTag(log.integrator)) dailyVolume.add(normalizeToken(log.fromAssetId), log.fromAmount, 'LI.FI');
  }

  // KyberSwap: the router emits Swapped, then ClientData with the JSON the integrator sent ({"Source":"trnch",...})
  const [kyberSwapped, kyberClientData] = await Promise.all([
    options.getLogs({ target: KYBER_ROUTER, eventAbi: KyberSwappedEvent, entireLog: true, maxBlockRange: 100000 }),
    options.getLogs({ target: KYBER_ROUTER, eventAbi: KyberClientDataEvent, entireLog: true, maxBlockRange: 100000 }),
  ]);
  const kyberByTx = new Map<string, any[]>();
  for (const log of [...kyberSwapped, ...kyberClientData]) {
    const key = String(log.transactionHash).toLowerCase();
    kyberByTx.set(key, [...(kyberByTx.get(key) ?? []), log]);
  }
  for (const logs of kyberByTx.values()) {
    logs.sort((a, b) => logIndexOf(a) - logIndexOf(b));
    let pending: any = null;
    for (const log of logs) {
      if (log.args.spentAmount !== undefined) {
        pending = log.args;
        continue;
      }
      if (!pending) continue;
      let source: any;
      try {
        const json = JSON.parse(Buffer.from(String(log.args.clientData).slice(2), 'hex').toString('utf8'));
        source = json.Source ?? json.source;
      } catch {
        continue; // ClientData of another integrator that is not JSON
      }
      if (!isTrnchTag(source)) continue;
      dailyVolume.add(normalizeToken(pending.srcToken), pending.spentAmount, 'KyberSwap');
      pending = null;
    }
  }

  // 0x and Uniswap: swaps that pay the TRNCH fee, counted on what the trader's wallet sent
  // (ETH value of the transaction and ERC-20 transfers out of the sender)
  // (KyberSwap fee payments are skipped here: those swaps are already counted from ClientData)
  const feeSwaps = (await getRouterFeePayments(options)).filter((p) => p.router !== 'kyberswap');
  if (feeSwaps.length) {
    const receipts = await getTxReceiptsWithRetry(options.chain, feeSwaps.map((p) => p.hash));
    feeSwaps.forEach((payment, i) => {
      const receipt: any = receipts[i];
      if (!receipt) throw new Error(`trnch: receipt ${payment.hash} not found`);
      if (Number(receipt.status) !== 1) return;
      const label = payment.router === '0x' ? '0x' : 'Uniswap';
      if (payment.value > 0n) dailyVolume.add(NULL_ADDRESS, payment.value, label);
      for (const log of receipt.logs) {
        if (log.topics[0] !== TRANSFER_TOPIC || log.topics.length !== 3) continue;
        if (!sameAddress('0x' + log.topics[1].slice(26), payment.from)) continue;
        dailyVolume.add(normalizeToken(log.address), BigInt(log.data), label);
      }
    });
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  doublecounted: true, // every TRNCH swap is executed by LI.FI, KyberSwap, 0x or Uniswap contracts, already listed
  chains: [CHAIN.ROBINHOOD],
  start: TRNCH_START,
  methodology: {
    Volume: 'Volume of swaps made on TRNCH and routed through LI.FI, KyberSwap, 0x or Uniswap on Robinhood Chain, counted on the token the trader sells. LI.FI swaps are identified by the TRNCH integrator id in LiFiGenericSwapCompleted, KyberSwap swaps by the TRNCH source in the router ClientData event, 0x and Uniswap swaps by the TRNCH integrator fee paid to the TRNCH treasury Safe in the same transaction. Bridges are excluded.',
  },
  breakdownMethodology: {
    Volume: {
      'LI.FI': 'Swaps routed through the LI.FI diamond with the TRNCH integrator id.',
      'KyberSwap': 'Swaps routed through the KyberSwap MetaAggregationRouterV2 with the TRNCH client source.',
      '0x': 'Swaps routed through the 0x AllowanceHolder that pay the TRNCH integrator fee.',
      'Uniswap': 'Swaps routed through the Uniswap Universal Router that pay the TRNCH integrator fee.',
    },
  },
};

export default adapter;
