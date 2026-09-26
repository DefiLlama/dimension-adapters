import * as sdk from "@defillama/sdk";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import ADDRESSES from "../../helpers/coreAssets.json";

// Packed (packd.cc) is a coin launchpad on Robinhood Chain and Ethereum.
//
// Robinhood Chain: a coin trades on Packed's own bonding curve (one PackedCurve contract per coin)
// until it has raised its graduation threshold, then the curve seeds a Uniswap v4 pool with the
// raised quote and keeps the position, which it can never remove. Every trade on the curve pays a
// 1% fee, three quarters of it to the coin's creator and a quarter to Packed, plus the creator's
// own tax (0-5%, fixed at launch) which is the creator's alone. After graduation the pool's 1% LP
// fee accrues in the curve's position and is split the same 75/25 when `collectFees` is called.
// Coins from the taxed and reward factories open their pool on a hook that keeps charging the
// creator tax on every pool swap.
//
// Ethereum: there is no curve. A coin is launched straight into a Uniswap v4 pool whose single
// position is held by a PackedPool contract (one clone per coin). The pool's LP fee is 1% plus the
// creator tax; `collectFees` credits the tax to the creator and splits the 1% 75/25. A launch-block
// surcharge on buys (anti-snipe) goes to the creator side. Packs launched from deposits pay half of
// every seat's bid to Packed inside the launch transaction.
//
// Both chains: a flat launch fee of 0.0004 ETH per coin, paid to Packed in the launch transaction.
//
// All numbers below were read back from the contracts on chain, not copied from docs:
// every factory answers feeBps() 100 (Robinhood), creatorShareBps() 7500, launchFee() 0.0004 ETH
// and protocolFeeRecipient() 0x71BB2cc5Be1599AaCD36080321f1b781a46fD1d9.
//
// Packs Packed runs on Pons (ponsdotfamily-v2) are not counted here: those coins trade on Pons and
// their fees are Pons' fees.

const NULL = ADDRESSES.null;
const BPS = 10_000n;
const CREATOR_SHARE_BPS = 7_500n; // creatorShareBps() on every factory, curve and pool below
const LAUNCH_FEE = 400_000_000_000_000n; // 0.0004 ETH, launchFee() on every factory that has one

// ── Events ──────────────────────────────────────────────────────────────────────────────────────
// `curve` is the coin's PackedCurve on Robinhood Chain and its PackedPool on Ethereum.
const LAUNCHED = "event Launched(address indexed token, address indexed curve, address indexed creator, string name, string symbol, uint256 creatorTaxBps)";
// Curve trades. `fee` and `tax` are in the curve's quote asset; `tax` includes the decaying
// anti-snipe tax of the first seconds, which is credited to the creator like the creator tax.
const BUY = "event Buy(address indexed buyer, address indexed recipient, uint256 quoteIn, uint256 tokensOut, uint256 fee, uint256 tax)";
const SELL = "event Sell(address indexed seller, address indexed recipient, uint256 tokensIn, uint256 quoteOut, uint256 fee, uint256 tax)";
// Pool fees taken out of the Uniswap v4 position: Robinhood curves and the first Ethereum set emit
// the two-field version, later Ethereum pools add the launch-block surcharge.
const FEES_COLLECTED = "event FeesCollected(uint256 quoteFees, uint256 tokenFees)";
const FEES_COLLECTED_V2 = "event FeesCollected(uint256 quoteFees, uint256 tokenFees, uint256 premium)";
// Creator tax charged by a hook on a pool swap; `currency` is either side of the pool (zero = ETH).
const TAXED = "event Taxed(bytes32 indexed id, address indexed creator, address currency, uint256 amount)";
const SNIPE_TAXED = "event SnipeTaxed(bytes32 indexed id, address indexed sender, address currency, uint256 amount)";
const PACK_LAUNCHED = "event PackLaunched(address indexed token, bytes32 indexed packId, uint256 seatsBought, uint256 seatsSkipped, uint256 bids, uint256 bidsToProtocol)";
// Buybacks of $PACKD: the token's transfers and the Uniswap v4 PoolManager's swaps. The topics are
// set explicitly so both queries are filtered at the node (sender and recipient, pool id).
const TRANSFER = "event Transfer(address indexed from, address indexed to, uint256 value)";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const POOL_SWAP = "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)";
const SWAP_TOPIC = "0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f";
const asTopic = (address: string) => "0x000000000000000000000000" + address.slice(2).toLowerCase();

// ── Chains ──────────────────────────────────────────────────────────────────────────────────────
type ChainConfig = {
  start: string;
  // At or before the first Launched event of any factory below.
  fromBlock: number;
  // Every factory that has launched a coin for the public, with the launch fee it charges. Older
  // factories stay listed because their coins still trade.
  factories: { factory: string; launchFee: bigint }[];
  // Hooks that charge the creator tax on pool swaps themselves and emit Taxed for it.
  taxHooks: string[];
  // Hooks that take the launch-block charge themselves and emit SnipeTaxed for it.
  snipeHooks: string[];
  // The factory that launches packs from deposits and emits PackLaunched, where there is one.
  packFactory?: string;
  // Coins trade on a PackedCurve (Buy/Sell events) before they reach a pool.
  curveTrades: boolean;
  // Pools whose LP fee is 1% plus the creator tax and whose FeesCollected carries a `premium`.
  taxInPoolFee: boolean;
  // Packed's own token, bought back on the open market by the fee wallet, where there is one.
  buyback?: { token: string; wallets: string[]; poolManager: string; poolId: string };
};

const chainConfig: Record<string, ChainConfig> = {
  // https://robinhoodchain.blockscout.com/address/0x3Ff274CF9A4B4a3ec6c524C8915B3ad2eD336ade
  [CHAIN.ROBINHOOD]: {
    start: "2026-09-04", // first launch, block 54350011
    fromBlock: 54_340_000,
    factories: [
      { factory: "0x3ff274cf9a4b4a3ec6c524c8915b3ad2ed336ade", launchFee: LAUNCH_FEE }, // current, with seat deposits
      { factory: "0xa5fb8e98aedb2ab59a61971a6956399df8059511", launchFee: LAUNCH_FEE }, // current, taxed pools
      { factory: "0x87c82a09d280b23537bdc9e4674ce6102b865514", launchFee: LAUNCH_FEE }, // current, reward coins
      { factory: "0x0fb1ea54e75c0de09978a71976ac4e6eb0638d69", launchFee: LAUNCH_FEE }, // reward coins, first version
      { factory: "0x25a6163adc23018bfae0f14177ff3a868d0adc93", launchFee: LAUNCH_FEE },
      { factory: "0x723e5f3db8336ced81c615711e79527ea69f1b8f", launchFee: LAUNCH_FEE },
      { factory: "0x831403902451c1349c3d041636836a8a49cd39cb", launchFee: LAUNCH_FEE },
      { factory: "0x465f4190baf203591c9d355778400e482dd467c0", launchFee: LAUNCH_FEE },
      { factory: "0x86a37f0adea97f5f2db030b78fc28cc28b63e452", launchFee: LAUNCH_FEE },
      { factory: "0x7b71fd14b89b7f0aaee9697723c2641a1e0c932b", launchFee: 0n }, // first set: no launchFee(), launches sent no value
    ],
    // The hooks of the taxed and reward factories (factory.hook()). The other factories' hooks
    // only gate pool creation.
    taxHooks: [
      "0x106b176f14fc793e37178b8afdea3bbd13eba044", // taxed factory
      "0x50844d4553e252ca779b736e34db1e6743ec6044", // reward factory
      "0xa9362f54b41bd75a9c3f5dfc295aad79ddabe044", // reward factory, first version
    ],
    snipeHooks: [],
    curveTrades: true,
    taxInPoolFee: false,
    // Packed buys back $PACKD and burns it. Every buy so far is a swap of ETH for $PACKD in the
    // ETH/$PACKD pool, made by one of two wallets: the fee wallet itself (first one: tx
    // 0xf06b6c6c8a5935a87f610dc805ee33a32c6ed50fff0e7f564b491f96ed090b95), and the team wallet that
    // launched $PACKD, which hands every $PACKD it buys to the fee wallet for the burn (25 buys,
    // 0.3774 ETH, 6,483,665 $PACKD bought and 6,626,140 passed on; it has never sold). Its launch
    // allocation went straight into a 12-month lock and is not a buy, so it is not counted.
    // The burns are plain transfers from the fee wallet to 0x...dEaD
    // (tx 0x382b9c93b0a5513ec0ab7dd29a654fcf60d0ae19cba50a4faea371a67bb1911d).
    buyback: {
      // https://robinhoodchain.blockscout.com/token/0x853E1A36876Cc4538BE636B78E7b2BD0aABC0dEd
      token: "0x853e1a36876cc4538be636b78e7b2bd0aabc0ded", // $PACKD
      wallets: [
        "0x71bb2cc5be1599aacd36080321f1b781a46fd1d9", // fee wallet: protocolFeeRecipient() of every factory above
        "0x88888ac5967484dd6e03d0b89e9a8abac6a88888", // team wallet, creator of $PACKD
      ],
      poolManager: "0x8366a39cc670b4001a1121b8f6a443a643e40951", // Uniswap v4 PoolManager on Robinhood Chain
      poolId: "0xf40adb78665275f2cdd62e06fc29d0a892c359790017612d198086ac6cd392ef", // ETH/$PACKD, from the Swap logs of the buys
    },
  },
  // https://etherscan.io/address/0x378708937B65CBeC6c5f1Cf5205960B12c9EB6AB
  [CHAIN.ETHEREUM]: {
    start: "2026-09-24", // first launch, block 26047618
    fromBlock: 26_047_465, // the first set's deployment
    factories: [
      { factory: "0x378708937b65cbec6c5f1cf5205960b12c9eb6ab", launchFee: LAUNCH_FEE }, // current: PackedPoolDepositFactory (packs from deposits)
      { factory: "0x75f2f001e66a721ab83990911a3ce33e2da8dfa2", launchFee: LAUNCH_FEE },
      { factory: "0xf154ab716d00d2c37576c7c4eabc99d30b80dbba", launchFee: LAUNCH_FEE },
      { factory: "0xa765219db324daffd9c67e6d4913623c8adcb4dc", launchFee: LAUNCH_FEE }, // first set: tax taken by its hook, pool fee is 1% only
    ],
    // The first set's hook, which took the creator tax and the launch-block charge itself,
    // outside the pool fee.
    taxHooks: ["0x0b89dc37a77255ceea712bbba2969f367a3920cc"],
    snipeHooks: ["0x0b89dc37a77255ceea712bbba2969f367a3920cc"],
    packFactory: "0x378708937b65cbec6c5f1cf5205960b12c9eb6ab",
    curveTrades: false,
    taxInPoolFee: true,
  },
};

// The pool's base LP fee in hundredths of a basis point (1%); on Ethereum the creator tax is added
// on top of it.
const POOL_BASE_FEE = 10_000n;

// ── Labels ──────────────────────────────────────────────────────────────────────────────────────
const LAUNCH_FEES = "Launch Fees";
const LAUNCH_FEES_TO_PROTOCOL = "Launch Fees to Protocol";
const CURVE_FEES = "Curve Trading Fees";
const CURVE_FEES_TO_PROTOCOL = "Curve Trading Fees to Protocol";
const CURVE_FEES_TO_CREATORS = "Curve Trading Fees to Creators";
const SWAP_FEES_TO_PROTOCOL = "Token Swap Fees to Protocol";
const SWAP_FEES_TO_CREATORS = "Token Swap Fees to Creators";
const CREATOR_TAX = "Creator Tax";
const SNIPE_SURCHARGE = "Launch Block Surcharge";
const PACK_BIDS = "Pack Seat Bids";
const PACK_BIDS_TO_PROTOCOL = "Pack Seat Bids to Protocol";
const PACK_BIDS_TO_LAUNCHERS = "Pack Seat Bids to Launchers";

type Balances = ReturnType<FetchOptions["createBalances"]>;

/** Adds an amount under a label, as native ETH when the token is the zero address. Skips zero. */
const add = (b: Balances, token: string, amount: bigint, label: string) => {
  if (amount <= 0n) return;
  if (!token || token.toLowerCase() === NULL) b.addGasToken(amount, label);
  else b.add(token, amount, label);
};

/** The creator's part of a fee, rounded down as the contracts round it; the rest is Packed's. */
const creatorPart = (fee: bigint) => (fee * CREATOR_SHARE_BPS) / BPS;

/** The balances this adapter fills, and the result object built from them. */
function balances(options: FetchOptions) {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue,
    result: () => ({
      dailyFees,
      dailyUserFees: dailyFees,
      dailyRevenue,
      dailyProtocolRevenue: dailyRevenue,
      dailySupplySideRevenue,
      dailyHoldersRevenue,
    }),
  };
}

/** Every coin a set of factories has launched, from their Launched events since `fromBlock`. */
async function launches(options: FetchOptions, factories: string[], fromBlock: number) {
  const logs = await options.getLogs({ targets: factories, eventAbi: LAUNCHED, fromBlock, flatten: false, cacheInCloud: true });
  const coins: { factory: string; token: string; curve: string; taxBps: bigint }[] = [];
  logs.forEach((factoryLogs: any[], i: number) => {
    for (const l of factoryLogs)
      coins.push({ factory: factories[i], token: String(l.token), curve: String(l.curve).toLowerCase(), taxBps: BigInt(l.creatorTaxBps) });
  });
  return coins;
}

/**
 * The quote asset of each curve or pool. It is immutable, so it is read at the latest block: the
 * public Robinhood RPC does not serve historical state. The first Robinhood set predates
 * `quoteToken` and only ever traded against ETH, so a failed read is ETH.
 */
async function quoteTokens(options: FetchOptions, contracts: string[]): Promise<string[]> {
  if (!contracts.length) return [];
  const latest = new sdk.ChainApi({ chain: options.chain });
  const quotes = await latest.multiCall({ abi: "address:quoteToken", calls: contracts, permitFailure: true });
  return quotes.map((q: any) => (q ? String(q).toLowerCase() : NULL));
}

/** Launch fees: a flat fee in ETH per launch in the window, paid to Packed inside the launch transaction. */
async function addLaunchFees(options: FetchOptions, factories: { factory: string; launchFee: bigint }[], b: ReturnType<typeof balances>) {
  const logs = await options.getLogs({ targets: factories.map((f) => f.factory), eventAbi: LAUNCHED, flatten: false });
  logs.forEach((factoryLogs: any[], i: number) => {
    const fees = factories[i].launchFee * BigInt(factoryLogs.length);
    add(b.dailyFees, NULL, fees, LAUNCH_FEES);
    add(b.dailyRevenue, NULL, fees, LAUNCH_FEES_TO_PROTOCOL);
  });
}

/** Creator tax charged by a hook on pool swaps: all of it is the creator's (or, for a reward coin, its holders'). */
async function addHookTaxes(options: FetchOptions, hooks: string[], b: ReturnType<typeof balances>) {
  const taxed = await options.getLogs({ targets: hooks, eventAbi: TAXED });
  for (const l of taxed) {
    add(b.dailyFees, String(l.currency), BigInt(l.amount), CREATOR_TAX);
    add(b.dailySupplySideRevenue, String(l.currency), BigInt(l.amount), CREATOR_TAX);
  }
}

/** The launch-block charge taken by a hook itself (Ethereum's first set), all of it the creator's. */
async function addHookSnipeCharges(options: FetchOptions, hooks: string[], b: ReturnType<typeof balances>) {
  const sniped = await options.getLogs({ targets: hooks, eventAbi: SNIPE_TAXED });
  for (const l of sniped) {
    add(b.dailyFees, String(l.currency), BigInt(l.amount), SNIPE_SURCHARGE);
    add(b.dailySupplySideRevenue, String(l.currency), BigInt(l.amount), SNIPE_SURCHARGE);
  }
}

/**
 * Packs launched from deposits: every bought seat's bid, half to Packed and half to the launcher,
 * split by the factory in the launch itself.
 */
async function addPackBids(options: FetchOptions, packFactory: string, b: ReturnType<typeof balances>) {
  const packs = await options.getLogs({ target: packFactory, eventAbi: PACK_LAUNCHED });
  for (const l of packs) {
    const bids = BigInt(l.bids);
    const toProtocol = BigInt(l.bidsToProtocol);
    add(b.dailyFees, NULL, bids, PACK_BIDS);
    add(b.dailyRevenue, NULL, toProtocol, PACK_BIDS_TO_PROTOCOL);
    add(b.dailySupplySideRevenue, NULL, bids - toProtocol, PACK_BIDS_TO_LAUNCHERS);
  }
}

/**
 * $PACKD bought back by the buyback wallets, valued at the ETH they paid. A buy is a transfer of
 * $PACKD from the PoolManager to one of the wallets; the ETH is the ETH side of the ETH/$PACKD swap
 * in the same transaction (ETH is currency0, and a negative amount0 is what the buyer paid in). The
 * token has no DefiLlama price, so the ETH paid is what can be valued.
 *
 * Counted at the buy rather than at the burn: the burn is a transfer of coins already counted, and
 * $PACKD has no price to value it by. A transfer into a wallet without a swap in this pool in the
 * same transaction (for example the team wallet handing its buys to the fee wallet) is not a buy,
 * and is left out, so nothing is counted twice.
 *
 * This overlaps Revenue rather than adding to it: the ETH spent is Packed's income.
 */
async function addBuybacks(options: FetchOptions, buyback: NonNullable<ChainConfig["buyback"]>, b: ReturnType<typeof balances>) {
  const received = (await Promise.all(buyback.wallets.map((wallet) => options.getLogs({
    target: buyback.token,
    eventAbi: TRANSFER,
    topics: [TRANSFER_TOPIC, asTopic(buyback.poolManager), asTopic(wallet)],
    onlyArgs: false,
  })))).flat();
  if (!received.length) return;
  // Each $PACKD receipt, by transaction. Every receipt is paired with one swap, so another swap in
  // the same transaction is never counted. The pool's hook keeps a cut of the $PACKD a swap pays out
  // (4% on the first team-wallet buy, tx 0xc4f698beb195...), so a receipt is at most the swap's
  // amount1 rather than equal to it.
  const receipts = new Map<string, bigint[]>();
  for (const l of received) {
    const tx = String(l.transactionHash).toLowerCase();
    receipts.set(tx, [...(receipts.get(tx) ?? []), BigInt(l.args.value)]);
  }
  const swaps = await options.getLogs({
    target: buyback.poolManager,
    eventAbi: POOL_SWAP,
    topics: [SWAP_TOPIC, buyback.poolId],
    onlyArgs: false,
  });
  for (const s of swaps) {
    const pending = receipts.get(String(s.transactionHash).toLowerCase());
    // amount0 < 0: ETH paid in; amount1 > 0: $PACKD paid out to the swapper.
    const out = BigInt(s.args.amount1);
    if (!pending?.length || out <= 0n || BigInt(s.args.amount0) >= 0n) continue;
    // The largest receipt this swap's payout covers.
    let at = -1;
    pending.forEach((v, i) => { if (v <= out && (at < 0 || v > pending[at])) at = i; });
    if (at < 0) continue;
    pending.splice(at, 1);
    add(b.dailyHoldersRevenue, NULL, -BigInt(s.args.amount0), METRIC.TOKEN_BUY_BACK);
  }
}

/** Fees, revenue, supply-side and holders revenue of Packed on `options.chain` in the window. */
const fetch = async (options: FetchOptions) => {
  const config = chainConfig[options.chain];
  const b = balances(options);
  const coins = await launches(options, config.factories.map((f) => f.factory), config.fromBlock);
  const contracts = coins.map((c) => c.curve);

  await addLaunchFees(options, config.factories, b);
  await addHookTaxes(options, config.taxHooks, b);
  if (config.snipeHooks.length) await addHookSnipeCharges(options, config.snipeHooks, b);
  if (config.packFactory) await addPackBids(options, config.packFactory, b);
  if (config.buyback) await addBuybacks(options, config.buyback, b);
  if (!contracts.length) return b.result();

  // Only the events a chain's contracts emit are requested; the rest stay empty per contract.
  const none = contracts.map((): any[] => []);
  const [buys, sells, collected, collectedWithPremium] = await Promise.all([
    config.curveTrades ? options.getLogs({ targets: contracts, eventAbi: BUY, flatten: false }) : none,
    config.curveTrades ? options.getLogs({ targets: contracts, eventAbi: SELL, flatten: false }) : none,
    options.getLogs({ targets: contracts, eventAbi: FEES_COLLECTED, flatten: false }),
    config.taxInPoolFee ? options.getLogs({ targets: contracts, eventAbi: FEES_COLLECTED_V2, flatten: false }) : none,
  ]);
  const active = contracts.filter((_, i) => buys[i].length || sells[i].length || collected[i].length || collectedWithPremium[i].length);
  const quotes = await quoteTokens(options, active);
  const quoteOf: Record<string, string> = {};
  active.forEach((c, i) => (quoteOf[c] = quotes[i]));

  coins.forEach((coin, i) => {
    const quote = quoteOf[coin.curve];
    // Curve trades (Robinhood Chain): the 1% fee split 75/25, and the creator's tax on top.
    for (const l of [...buys[i], ...sells[i]]) {
      const fee = BigInt(l.fee);
      const tax = BigInt(l.tax);
      const toCreator = creatorPart(fee);
      add(b.dailyFees, quote, fee, CURVE_FEES);
      add(b.dailyFees, quote, tax, CREATOR_TAX);
      add(b.dailyRevenue, quote, fee - toCreator, CURVE_FEES_TO_PROTOCOL);
      add(b.dailySupplySideRevenue, quote, toCreator, CURVE_FEES_TO_CREATORS);
      add(b.dailySupplySideRevenue, quote, tax, CREATOR_TAX);
    }
    // The pool fee is the 1% alone, in both currencies, split 75/25 when collected: Robinhood pools
    // after graduation, and the first Ethereum set (its tax is read from the hook above).
    for (const l of collected[i]) {
      for (const [token, amount] of [[quote, BigInt(l.quoteFees)], [coin.token, BigInt(l.tokenFees)]] as [string, bigint][]) {
        const toCreator = creatorPart(amount);
        add(b.dailyFees, token, amount, METRIC.SWAP_FEES);
        add(b.dailyRevenue, token, amount - toCreator, SWAP_FEES_TO_PROTOCOL);
        add(b.dailySupplySideRevenue, token, toCreator, SWAP_FEES_TO_CREATORS);
      }
    }
    // Later Ethereum sets: the LP fee is 1% + the creator tax, and on a hooked pool buys in the
    // launch block pay a surcharge on top. PackedPool.collectFees gives the surcharge to the creator
    // side, and of the rest takes `base = fees * 1% / (1% + tax)` as the 1%, split 75/25, and the
    // remainder as the creator's tax. The same integer arithmetic is repeated here, so the
    // protocol's share matches the Owed events to the wei.
    const restingFee = POOL_BASE_FEE + coin.taxBps * 100n;
    for (const l of collectedWithPremium[i]) {
      const premium = BigInt(l.premium);
      add(b.dailyFees, quote, premium, SNIPE_SURCHARGE);
      add(b.dailySupplySideRevenue, quote, premium, SNIPE_SURCHARGE);
      for (const [token, amount] of [[quote, BigInt(l.quoteFees) - premium], [coin.token, BigInt(l.tokenFees)]] as [string, bigint][]) {
        const base = (amount * POOL_BASE_FEE) / restingFee;
        const toProtocol = base - creatorPart(base);
        add(b.dailyFees, token, base, METRIC.SWAP_FEES);
        add(b.dailyFees, token, amount - base, CREATOR_TAX);
        add(b.dailyRevenue, token, toProtocol, SWAP_FEES_TO_PROTOCOL);
        add(b.dailySupplySideRevenue, token, base - toProtocol, SWAP_FEES_TO_CREATORS);
        add(b.dailySupplySideRevenue, token, amount - base, CREATOR_TAX);
      }
    }
  });

  return b.result();
};

const methodology = {
  Fees: "Everything users pay through Packed: the flat 0.0004 ETH launch fee, the 1% fee on every trade on a Packed bonding curve (Robinhood Chain), the 1% LP fee of every Packed coin's Uniswap v4 pool (after graduation on Robinhood Chain, from launch on Ethereum), the creator tax a coin's creator sets at launch (0-5%, on curve trades and pool swaps), the anti-snipe charges of a coin's first seconds or first block, and the bids paid for seats in packs launched from deposits on Ethereum. All of it is paid by users: launch fees and bids by creators and pack members, the rest by traders. Pool fees are counted when they are collected from the position.",
  Revenue: "Packed's share: the launch fee in full, 25% of the 1% curve fee, 25% of the 1% pool fee, and half of every seat bid.",
  ProtocolRevenue: "Same as Revenue; all of it is paid to Packed's fee wallet.",
  SupplySideRevenue: "The creator's 75% of the 1% curve and pool fees, the whole creator tax and anti-snipe charges, and the launcher's half of seat bids. For a reward coin the creator's share goes to the coin's holders instead.",
  HoldersRevenue: "ETH Packed spends buying back $PACKD, its own token, on the open market on Robinhood Chain, from the fee wallet and the team wallet; the coins bought are burned. It overlaps Revenue rather than adding to it.",
};

const breakdownMethodology = {
  Fees: {
    [LAUNCH_FEES]: "Flat 0.0004 ETH paid by the creator for each coin launched.",
    [CURVE_FEES]: "1% of the quote side of every buy and sell on a Packed bonding curve on Robinhood Chain.",
    [METRIC.SWAP_FEES]: "The 1% LP fee of a Packed coin's Uniswap v4 pool, in both currencies, counted when collectFees takes it out of the position.",
    [CREATOR_TAX]: "The creator's own tax (0-5%, fixed at launch) on curve trades and pool swaps, including the decaying anti-snipe tax of a Robinhood curve's first seconds.",
    [SNIPE_SURCHARGE]: "The surcharge on buys in an Ethereum coin's launch block, other than the launch's own buys.",
    [PACK_BIDS]: "Bids paid by pack members for their seats in packs launched from deposits on Ethereum.",
  },
  Revenue: {
    [LAUNCH_FEES_TO_PROTOCOL]: "The launch fee, kept in full by Packed.",
    [CURVE_FEES_TO_PROTOCOL]: "Packed's 25% of the 1% curve fee.",
    [SWAP_FEES_TO_PROTOCOL]: "Packed's 25% of the 1% pool fee.",
    [PACK_BIDS_TO_PROTOCOL]: "Half of every seat bid, paid to Packed by the factory inside the launch.",
  },
  ProtocolRevenue: {
    [LAUNCH_FEES_TO_PROTOCOL]: "The launch fee, kept in full by Packed.",
    [CURVE_FEES_TO_PROTOCOL]: "Packed's 25% of the 1% curve fee.",
    [SWAP_FEES_TO_PROTOCOL]: "Packed's 25% of the 1% pool fee.",
    [PACK_BIDS_TO_PROTOCOL]: "Half of every seat bid, paid to Packed by the factory inside the launch.",
  },
  SupplySideRevenue: {
    [CURVE_FEES_TO_CREATORS]: "The creator's 75% of the 1% curve fee (the coin's holders' for a reward coin).",
    [SWAP_FEES_TO_CREATORS]: "The creator's 75% of the 1% pool fee (the coin's holders' for a reward coin).",
    [CREATOR_TAX]: "The creator tax and the curve's anti-snipe tax, all of it the creator's (the holders' for a reward coin).",
    [SNIPE_SURCHARGE]: "The Ethereum launch-block surcharge, paid to the creator.",
    [PACK_BIDS_TO_LAUNCHERS]: "The launcher's half of every seat bid.",
  },
  HoldersRevenue: {
    [METRIC.TOKEN_BUY_BACK]: "ETH spent by the fee wallet and the team wallet swapping for $PACKD in the ETH/$PACKD Uniswap v4 pool, on the day of each buy. The coins bought are burned.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig, // start dates are read from chainConfig per chain
  // The pool part is Uniswap v4 LP fee: Packed's pools charge their fee as an ordinary LP fee (1%,
  // plus the creator tax on Ethereum) that accrues to the one position Packed holds, and the
  // uniswap-v4 adapter counts that fee from the Swap events on both chains. The curve fees and
  // launch fees are not counted anywhere else, but the flag is set for the whole adapter.
  doublecounted: true,
  methodology,
  breakdownMethodology,
};

export default adapter;
