import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getTxReceiptsWithRetry } from "../../helpers/getTxReceipts";

// Kalos (https://www.kalos.fun) on Kinetiq Elysium. Its Trade terminal (Sniper) and Swap panel do not have a router of their
// own: Kalos builds each trade itself and sends it through 0x's Settler (via 0x's AllowanceHolder for token inputs),
// through a launchpad's own router (Ascend), or through the Kalos Universal Router. Every one of these trades pays the
// Kalos fee (1% on the Trade terminal and on launchpad tokens, 0.2% on other Swap panel trades) as a transfer from the
// router to the Kalos revenue splitter inside the same transaction. That transfer is how a Kalos trade is identified.
// Contracts: https://www.kalos.fun/learn/contracts, fees: https://www.kalos.fun/learn/fees

// KalosRevenueSplitterV2 (proxy): receives every Kalos fee (https://elysium.kinetiq.xyz/address/0xcA105395094Ceb27e6AfdA492c6379cBF468CDb8)
export const KALOS_SPLITTER = '0xcA105395094Ceb27e6AfdA492c6379cBF468CDb8';
// Kalos DEX: canonical Uniswap V3 factory deployed by Kalos (its swaps are counted by dexs/kalos-dex)
export const KALOS_V3_FACTORY = '0x8C60243181370bDA9A7d1a45b1249A8263da0158';
export const KALOS_START = '2026-11-05';

// Routers that pay the Kalos fee out of a trade
const ASCEND_ROUTER = '0x1B341FDD55d56F8E08409A2C25DDFad93Eb03C1a'; // Ascend launchpad Universal Router (Uniswap V4), https://www.kalos.fun/learn/contracts
const KALOS_UNIVERSAL_ROUTER = '0x6739E3cE3705719cFfCf76f6acdB06b4aceb8B5e'; // Uniswap UniversalRouter v2.0.0 deployed by Kalos for its Swap panel
// 0x's Settler deployer/registry (same address on every chain): ownerOf(2) is the current taker-submitted Settler and
// prev(2) the one it replaced. 0x replaces its Settler from time to time, so the Settlers are read at the window's end.
const ZEROX_SETTLER_REGISTRY = '0x00000000000004533Fe15556B1E086BB1A72cEae';
// Settlers that Kalos trades went through (registry ownerOf(2) since block 295,134 and since block 3,115,979)
const KNOWN_SETTLERS = ['0xDe4537EcED4bf8AFBA09dd4f4eBEEf6De3B17714', '0xB2766443c2f92FBE579F057593802737BC88F591'];

const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const SWAP_TOPICS = {
  uniV2: '0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822', // Swap(address,uint256,uint256,uint256,uint256,address)
  uniV3: '0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67', // Swap(address,address,int256,int256,uint160,uint128,int24)
  uniV4: '0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f', // Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)
};
const TransferEvent = 'event Transfer(address indexed from, address indexed to, uint256 value)';

const padAddress = (address: string) => '0x' + address.slice(2).toLowerCase().padStart(64, '0');
const topicAddress = (topic: string) => ('0x' + topic.slice(26)).toLowerCase();

export type KalosTradeFee = {
  hash: string;
  router: 'zerox' | 'ascend' | 'kalos';
  token: string;
  fee: bigint; // Kalos fee paid to the splitter
  size: bigint; // trade size in the fee token, before the fee: everything the router received of that token in the tx
  kalosPoolsOnly: boolean; // every swap of the trade was on Kalos DEX pools
};

// receipts are fetched in small sequential batches, retried with back-off: a busy hour has a few hundred Kalos trades
// and the public Elysium RPC rate-limits bursts of getTransactionReceipt
const RECEIPT_BATCH = 3;
const RECEIPT_ATTEMPTS = 6;

async function getReceipts(chain: string, hashes: string[]): Promise<any[]> {
  const receipts: any[] = [];
  for (let i = 0; i < hashes.length; i += RECEIPT_BATCH) {
    const batch = hashes.slice(i, i + RECEIPT_BATCH);
    for (let attempt = 1; ; attempt++) {
      try {
        receipts.push(...await getTxReceiptsWithRetry(chain, batch));
        break;
      } catch (error) {
        if (attempt >= RECEIPT_ATTEMPTS) throw error;
        await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
      }
    }
  }
  return receipts;
}

async function getRouters(options: FetchOptions, senders: string[]): Promise<Record<string, 'zerox' | 'ascend' | 'kalos'>> {
  const routers: Record<string, 'zerox' | 'ascend' | 'kalos'> = {
    [ASCEND_ROUTER.toLowerCase()]: 'ascend',
    [KALOS_UNIVERSAL_ROUTER.toLowerCase()]: 'kalos',
  };
  KNOWN_SETTLERS.forEach((settler) => routers[settler.toLowerCase()] = 'zerox');
  // only ask 0x's registry when a transfer to the splitter came from a sender that is not a known router
  // (a Settler newer than KNOWN_SETTLERS, or a non-trade fee such as a KalosMarket offer fee)
  if (senders.every((sender) => routers[sender])) return routers;
  for (const abi of ['function ownerOf(uint256) view returns (address)', 'function prev(uint128) view returns (address)']) {
    const settler = await options.toApi.call({ target: ZEROX_SETTLER_REGISTRY, abi, params: [2] });
    if (settler && settler !== '0x0000000000000000000000000000000000000000') routers[settler.toLowerCase()] = 'zerox';
  }
  return routers;
}

// Kalos fees paid by a router inside a trade, with the size of that trade (see methodology)
export async function getKalosTradeFees(options: FetchOptions): Promise<KalosTradeFee[]> {
  // ERC-20 transfers to the splitter, any token: the fee is taken in WHYPE or USDC when one side of the trade is HYPE,
  // WHYPE or USDC, else in the bought token. The splitter is the indexed `to`, so the node filters them.
  const toSplitter = await options.getLogs({
    noTarget: true,
    eventAbi: TransferEvent,
    topics: [TRANSFER_TOPIC, null, padAddress(KALOS_SPLITTER)],
    entireLog: true,
    allowParseFailure: true, // ERC-721 Transfers share topic0 and do not decode
  });
  const transfers = toSplitter.filter((log: any) => log.args);
  if (!transfers.length) return [];
  const routers = await getRouters(options, [...new Set(transfers.map((log: any) => String(log.args.from).toLowerCase()))]);
  const feeLogs = transfers.filter((log: any) => routers[String(log.args.from).toLowerCase()]);
  const hashes = [...new Set(feeLogs.map((log: any) => String(log.transactionHash).toLowerCase()))];
  if (!hashes.length) return [];

  const receipts = await getReceipts(options.chain, hashes);
  const receiptByHash: Record<string, any> = {};
  hashes.forEach((hash, i) => {
    if (!receipts[i]) throw new Error(`kalos: receipt ${hash} not found`);
    receiptByHash[hash] = receipts[i];
  });

  // pools that emitted a Uniswap V3 swap in these trades, and whether the Kalos factory created them
  const v3Pools = new Set<string>();
  Object.values(receiptByHash).forEach((receipt: any) => receipt.logs.forEach((log: any) => {
    if (log.topics[0] === SWAP_TOPICS.uniV3) v3Pools.add(log.address.toLowerCase());
  }));
  const poolList = [...v3Pools];
  // permitFailure: another venue's pool may have no factory() at all (a revert, not an RPC error); it is not a Kalos pool
  const factories = await options.api.multiCall({ abi: 'address:factory', calls: poolList, permitFailure: true });
  const kalosPools = new Set(poolList.filter((_, i) => String(factories[i] ?? '').toLowerCase() === KALOS_V3_FACTORY.toLowerCase()));

  const trades: KalosTradeFee[] = [];
  for (const feeLog of feeLogs) {
    const hash = String(feeLog.transactionHash).toLowerCase();
    const receipt = receiptByHash[hash];
    if (Number(receipt.status) !== 1) continue;
    const payer = String(feeLog.args.from).toLowerCase();
    const token = String(feeLog.address).toLowerCase();
    // trade size: all of the fee token the router received in the transaction (the user's input it pulled in or
    // wrapped, or the pool output of a sell), from which it paid the fee
    const size = receipt.logs
      .filter((log: any) => log.topics[0] === TRANSFER_TOPIC && log.topics.length === 3 && String(log.address).toLowerCase() === token && topicAddress(log.topics[2]) === payer)
      .reduce((sum: bigint, log: any) => sum + BigInt(log.data), 0n);
    const swaps = receipt.logs.filter((log: any) => Object.values(SWAP_TOPICS).includes(log.topics[0]));
    const kalosPoolsOnly = swaps.length > 0 && swaps.every((log: any) => log.topics[0] === SWAP_TOPICS.uniV3 && kalosPools.has(log.address.toLowerCase()));
    trades.push({ hash, router: routers[payer], token, fee: BigInt(feeLog.args.value), size, kalosPoolsOnly });
  }
  return trades;
}

const ROUTER_LABELS = { zerox: '0x Settler', ascend: 'Ascend Router', kalos: 'Kalos Universal Router' };

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const trades = await getKalosTradeFees(options);
  const counted = new Set<string>();
  for (const trade of trades) {
    // swaps only on Kalos DEX pools are Kalos DEX volume (dexs/kalos-dex), not routed volume
    if (trade.kalosPoolsOnly) continue;
    // one trade per transaction: a second fee transfer in the same trade is not a second trade
    if (counted.has(trade.hash)) continue;
    counted.add(trade.hash);
    dailyVolume.add(trade.token, trade.size, ROUTER_LABELS[trade.router]);
  }
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  doublecounted: true, // every trade is executed by 0x's Settler or by the launchpad's own pools, which are listed themselves
  chains: [CHAIN.ELYSIUM],
  start: KALOS_START,
  methodology: {
    Volume: "Trades made on the Kalos Trade terminal and Swap panel and routed through 0x's Settler, the Ascend launchpad router or the Kalos Universal Router. A trade is identified by the Kalos fee its router pays to the Kalos revenue splitter in the same transaction, and its size is the amount of the fee token (WHYPE, USDC or the bought token) the router received in that transaction, before the fee. Trades whose swaps were all on Kalos DEX pools are excluded, they are counted as Kalos DEX volume.",
  },
  breakdownMethodology: {
    Volume: {
      '0x Settler': "Kalos trades routed through 0x's Settler (the Settler named by 0x's registry, and the one it replaced).",
      'Ascend Router': 'Kalos trades of Ascend launchpad tokens routed through the Ascend Universal Router.',
      'Kalos Universal Router': 'Kalos Swap panel trades through the Kalos Universal Router that use pools other than Kalos DEX pools.',
    },
  },
};

export default adapter;
