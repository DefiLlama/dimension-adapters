import { EventFragment } from "ethers";
import { FetchOptions } from "../adapters/types";
import { getTxReceiptsWithRetry } from "./getTxReceipts";
import ADDRESSES from "./coreAssets.json";

// Kalos (https://www.kalos.fun) on Kinetiq Elysium: values and logic shared by the Kalos adapters
// (aggregators/kalos-trade, dexs/kalos-launchpad and dexs/kalos-marketplace).
// Contracts: https://www.kalos.fun/learn/contracts, fees: https://www.kalos.fun/learn/fees

// KalosRevenueSplitterV2 (proxy): receives every Kalos fee (https://elysium.kinetiq.xyz/address/0xcA105395094Ceb27e6AfdA492c6379cBF468CDb8)
export const KALOS_SPLITTER = '0xcA105395094Ceb27e6AfdA492c6379cBF468CDb8';
// Kalos DEX: canonical Uniswap V3 factory deployed by Kalos, created in block 915221 on 2026-11-05 (its swaps are counted by
// the kalos-dex entry in factory/uniV3.ts)
const KALOS_V3_FACTORY ='0x8C60243181370bDA9A7d1a45b1249A8263da0158';
const KALOS_V3_FACTORY_BLOCK = 915221;
export const KALOS_START = '2026-11-05';

const PoolCreatedEvent = 'event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)';

/**
 * Every Kalos DEX pool created up to the window's end (lowercase), from the factory's own PoolCreated logs since its
 * creation block: a small config scan, cached. Used to tell Kalos DEX-only trades from routed ones. Read up to the
 * window's end rather than from the TVL adapter's pool cache (which factory/uniV3.ts uses for kalos-dex): that cache lags
 * by up to an hour, and a pool it misses would count a Kalos DEX-only trade as routed volume.
 */
async function getKalosPools(options: FetchOptions): Promise<string[]> {
  const logs = await options.getLogs({
    target: KALOS_V3_FACTORY,
    eventAbi: PoolCreatedEvent,
    fromBlock: KALOS_V3_FACTORY_BLOCK,
    toBlock: await options.getToBlock(),
    cacheInCloud: true,
  });
  return logs.map((log: any) => String(log.pool).toLowerCase());
}

// The Kalos Trade terminal (Sniper) and Swap panel do not have a router of their own: Kalos builds each trade itself and
// sends it through 0x's Settler (via 0x's AllowanceHolder for token inputs), through a launchpad's own router (Ascend), or
// through the Kalos Universal Router. Every one of these trades pays the Kalos fee (1% on the Trade terminal and on
// launchpad tokens, 0.2% on other Swap panel trades) as a transfer from the router to the Kalos revenue splitter inside the
// same transaction. That transfer is how a Kalos trade is identified.
const ASCEND_ROUTER = '0x1B341FDD55d56F8E08409A2C25DDFad93Eb03C1a'; // Ascend launchpad Universal Router (Uniswap V4), https://www.kalos.fun/learn/contracts
const KALOS_UNIVERSAL_ROUTER = '0x6739E3cE3705719cFfCf76f6acdB06b4aceb8B5e'; // Uniswap UniversalRouter v2.0.0 deployed by Kalos for its Swap panel
// 0x's Settler deployer/registry (same address on every chain): ownerOf(2) is the current taker-submitted Settler and
// prev(2) the one it replaced. 0x replaces its Settler from time to time, so the Settlers are read at the window's end.
const ZEROX_SETTLER_REGISTRY = '0x00000000000004533Fe15556B1E086BB1A72cEae';
// Settlers that Kalos trades went through (registry ownerOf(2) since block 295,134, since block 3,115,979, and the
// 0x-settler c3fb541 build that replaced it)
const KNOWN_SETTLERS = [
  '0xDe4537EcED4bf8AFBA09dd4f4eBEEf6De3B17714',
  '0xB2766443c2f92FBE579F057593802737BC88F591',
  '0x871751aA324B9a148961302a4C1316084862C0B7',
];

// Receipts are fetched a few at a time, retried with back-off: a busy hour has a few hundred Kalos trades and the public
// Elysium RPC answers bursts of getTransactionReceipt with HTTP 429 (getTxReceipts alone asks 20 at once)
const RECEIPT_BATCH = 3;
const RECEIPT_ATTEMPTS = 6;

/** Receipts of `hashes`, in order, fetched a few at a time with exponential back-off on RPC errors */
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

const TransferEvent = 'event Transfer(address indexed from, address indexed to, uint256 value)';
// Swap events of the venues a Kalos trade can go through, used to tell Kalos DEX-only trades from routed ones
const SwapEvents = {
  uniV2: 'event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)',
  uniV3: 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)',
  uniV4: 'event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)',
};

/** topic0 of a human-readable event ABI, for matching raw receipt logs */
export const eventTopic = (eventAbi: string) => EventFragment.from(eventAbi).topicHash;
/** An address as a 32-byte indexed-topic value, for getLogs topic filters */
export const padAddress = (address: string) => '0x' + address.slice(2).toLowerCase().padStart(64, '0');
const topicAddress = (topic: string) => ('0x' + topic.slice(26)).toLowerCase();

const TRANSFER_TOPIC = eventTopic(TransferEvent);
const SWAP_TOPICS = Object.values(SwapEvents).map(eventTopic);
const UNIV3_SWAP_TOPIC = eventTopic(SwapEvents.uniV3);

export type KalosRouter = 'zerox' | 'ascend' | 'kalos';

export type KalosTradeFee = {
  hash: string;
  router: KalosRouter;
  token: string;
  fee: bigint; // Kalos fee paid to the splitter
  size: bigint; // trade size in the fee token, before the fee: everything the router received of that token in the tx
  kalosPoolsOnly: boolean; // every swap of the trade was on Kalos DEX pools
};

/** The routers that pay the Kalos fee out of a trade, by lowercase address; asks 0x's registry only for an unknown sender */
async function getRouters(options: FetchOptions, senders: string[]): Promise<Record<string, KalosRouter>> {
  const routers: Record<string, KalosRouter> = {
    [ASCEND_ROUTER.toLowerCase()]: 'ascend',
    [KALOS_UNIVERSAL_ROUTER.toLowerCase()]: 'kalos',
  };
  KNOWN_SETTLERS.forEach((settler) => routers[settler.toLowerCase()] = 'zerox');
  // only ask 0x's registry when a transfer to the splitter came from a sender that is not a known router
  // (a Settler newer than KNOWN_SETTLERS, or a non-trade fee such as a KalosMarket offer fee)
  if (senders.every((sender) => routers[sender])) return routers;
  // KalosMarket fees paid in WHYPE come from the buyer, so most hours ask; a refused call (the public Elysium RPC answers
  // bursts with HTTP 429) keeps KNOWN_SETTLERS rather than failing the whole hour
  let settlers: string[] = [];
  try {
    settlers = await options.toApi.batchCall([
      { target: ZEROX_SETTLER_REGISTRY, abi: 'function ownerOf(uint256) view returns (address)', params: [2] },
      { target: ZEROX_SETTLER_REGISTRY, abi: 'function prev(uint128) view returns (address)', params: [2] },
    ]);
  } catch {
    return routers;
  }
  settlers.forEach((settler: string) => {
    if (settler && settler !== ADDRESSES.null) routers[settler.toLowerCase()] = 'zerox';
  });
  return routers;
}

/**
 * Kalos fees paid by a router inside a trade in the window, with the size of that trade: the transfers to the Kalos
 * revenue splitter sent by a fee router, and from each trade's receipt everything that router received of the fee token
 * and whether every swap of the trade was on a Kalos DEX pool.
 */
export async function getKalosTradeFees(options: FetchOptions): Promise<KalosTradeFee[]> {
  // ERC-20 transfers to the splitter, any token: the fee is taken in WHYPE or USDC when one side of the trade is HYPE,
  // WHYPE or USDC, else in the bought token, so the fee tokens cannot be listed up front. The splitter is the indexed
  // `to`, so the node filters them by topic.
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

  // Kalos DEX pools come from the factory's own PoolCreated logs, not from a factory() call on each pool: a failed call
  // could not be told from a pool without factory(), and would count a Kalos DEX-only trade as routed volume. They are
  // only needed when a trade went through a Uniswap V3 pool.
  const hasV3Swap = Object.values(receiptByHash).some((receipt: any) => receipt.logs.some((log: any) => log.topics[0] === UNIV3_SWAP_TOPIC));
  const kalosPools = new Set(hasV3Swap ? await getKalosPools(options) : []);

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
    const swaps = receipt.logs.filter((log: any) => SWAP_TOPICS.includes(log.topics[0]));
    const kalosPoolsOnly = swaps.length > 0 && swaps.every((log: any) => log.topics[0] === UNIV3_SWAP_TOPIC && kalosPools.has(log.address.toLowerCase()));
    trades.push({ hash, router: routers[payer], token, fee: BigInt(feeLog.args.value), size, kalosPoolsOnly });
  }
  return trades;
}

// Referral rewards: the splitter pays a fifth of every fee to the KalosReferralPool (0xADC8a8D0a7153C00c3eEBc3E9082F5aCdA6a7311),
// which funds the weekly referral payouts (Settled events) and returns the rest to the four Kalos vaults. A referrer earns
// 10-20% of the fees paid by the users they referred; referral codes are kept off chain and one payout batch per token
// covers every Kalos product, so a payout cannot be attributed to a product on chain.
export const kalosReferralExclusion = (product: string) => `Referral rewards (10-20% of the fees paid by referred users) are not deducted, as they cannot be attributed to ${product} on chain.`;
