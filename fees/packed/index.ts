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

// ── Robinhood Chain ─────────────────────────────────────────────────────────────────────────────
// https://robinhoodchain.blockscout.com/address/0x3Ff274CF9A4B4a3ec6c524C8915B3ad2eD336ade
// Every PackedCurveFactory that has launched a coin for the public. Older ones stay listed because
// their coins still trade. `launchFee` is the fee each one charges; the first set charged none.
const RH_FROM_BLOCK = 54_340_000; // before the first launch (block 54350011, 2026-09-04)
const RH_FACTORIES: { factory: string; launchFee: bigint }[] = [
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
];
// The hooks of the taxed and reward factories (factory.hook()), which charge the creator tax on
// every swap in a graduated coin's pool. The other factories' hooks only gate pool creation.
const RH_TAX_HOOKS = [
  "0x106b176f14fc793e37178b8afdea3bbd13eba044", // taxed factory
  "0x50844d4553e252ca779b736e34db1e6743ec6044", // reward factory
  "0xa9362f54b41bd75a9c3f5dfc295aad79ddabe044", // reward factory, first version
];

// ── Ethereum ────────────────────────────────────────────────────────────────────────────────────
// https://etherscan.io/address/0x378708937B65CBeC6c5f1Cf5205960B12c9EB6AB
const ETH_FROM_BLOCK = 26_047_465; // the first set's deployment, 2026-09-24
const ETH_FACTORIES = [
  "0x378708937b65cbec6c5f1cf5205960b12c9eb6ab", // current: PackedPoolDepositFactory (packs from deposits)
  "0x75f2f001e66a721ab83990911a3ce33e2da8dfa2",
  "0xf154ab716d00d2c37576c7c4eabc99d30b80dbba",
  "0xa765219db324daffd9c67e6d4913623c8adcb4dc", // first set: tax taken by its hook, pool fee is 1% only
];
const ETH_FIRST_SET = "0xa765219db324daffd9c67e6d4913623c8adcb4dc";
// The first set's hook, which took the creator tax and the launch-block charge itself.
const ETH_FIRST_SET_HOOK = "0x0b89dc37a77255ceea712bbba2969f367a3920cc";
const ETH_DEPOSIT_FACTORY = "0x378708937b65cbec6c5f1cf5205960b12c9eb6ab";
// The pool's base LP fee in hundredths of a basis point (1%); the creator tax is added on top of it.
const POOL_BASE_FEE = 10_000n;

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
const add = (b: Balances, token: string, amount: bigint, label: string) => {
  if (amount <= 0n) return;
  if (!token || token.toLowerCase() === NULL) b.addGasToken(amount, label);
  else b.add(token, amount, label);
};
// The creator's part of a fee, rounded down as the contracts round it; the rest is Packed's.
const creatorPart = (fee: bigint) => (fee * CREATOR_SHARE_BPS) / BPS;

function balances(options: FetchOptions) {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    result: () => ({
      dailyFees,
      dailyUserFees: dailyFees,
      dailyRevenue,
      dailyProtocolRevenue: dailyRevenue,
      dailySupplySideRevenue,
    }),
  };
}

// Every coin a set of factories has launched, from their Launched events since deployment.
async function launches(options: FetchOptions, factories: string[], fromBlock: number) {
  const logs = await options.getLogs({ targets: factories, eventAbi: LAUNCHED, fromBlock, flatten: false, cacheInCloud: true });
  const coins: { factory: string; token: string; curve: string; taxBps: bigint }[] = [];
  logs.forEach((factoryLogs: any[], i: number) => {
    for (const l of factoryLogs)
      coins.push({ factory: factories[i], token: String(l.token), curve: String(l.curve).toLowerCase(), taxBps: BigInt(l.creatorTaxBps) });
  });
  return coins;
}

// The quote asset of each curve or pool. It is immutable, so it is read at the latest block: the
// public Robinhood RPC does not serve historical state. The first Robinhood set predates
// `quoteToken` and only ever traded against ETH, so a failed read is ETH.
async function quoteTokens(options: FetchOptions, contracts: string[]): Promise<string[]> {
  if (!contracts.length) return [];
  const latest = new sdk.ChainApi({ chain: options.chain });
  const quotes = await latest.multiCall({ abi: "address:quoteToken", calls: contracts, permitFailure: true });
  return quotes.map((q: any) => (q ? String(q).toLowerCase() : NULL));
}

// Launch fees: a flat fee in ETH per launch, paid to Packed inside the launch transaction.
async function addLaunchFees(options: FetchOptions, factories: { factory: string; launchFee: bigint }[], b: ReturnType<typeof balances>) {
  const logs = await options.getLogs({ targets: factories.map((f) => f.factory), eventAbi: LAUNCHED, flatten: false });
  logs.forEach((factoryLogs: any[], i: number) => {
    const fees = factories[i].launchFee * BigInt(factoryLogs.length);
    add(b.dailyFees, NULL, fees, LAUNCH_FEES);
    add(b.dailyRevenue, NULL, fees, LAUNCH_FEES_TO_PROTOCOL);
  });
}

// Creator tax charged by a hook on pool swaps: all of it is the creator's (or, for a reward coin,
// its holders').
async function addHookTaxes(options: FetchOptions, hooks: string[], b: ReturnType<typeof balances>) {
  const taxed = await options.getLogs({ targets: hooks, eventAbi: TAXED });
  for (const l of taxed) {
    add(b.dailyFees, String(l.currency), BigInt(l.amount), CREATOR_TAX);
    add(b.dailySupplySideRevenue, String(l.currency), BigInt(l.amount), CREATOR_TAX);
  }
}

const fetchRobinhood = async (options: FetchOptions) => {
  const b = balances(options);
  const coins = await launches(options, RH_FACTORIES.map((f) => f.factory), RH_FROM_BLOCK);
  const curves = coins.map((c) => c.curve);

  await addLaunchFees(options, RH_FACTORIES, b);
  await addHookTaxes(options, RH_TAX_HOOKS, b);
  if (!curves.length) return b.result();

  const [buys, sells, collected] = await Promise.all([
    options.getLogs({ targets: curves, eventAbi: BUY, flatten: false }),
    options.getLogs({ targets: curves, eventAbi: SELL, flatten: false }),
    options.getLogs({ targets: curves, eventAbi: FEES_COLLECTED, flatten: false }),
  ]);
  const active = curves.filter((_, i) => buys[i].length || sells[i].length || collected[i].length);
  const quotes = await quoteTokens(options, active);
  const quoteOf: Record<string, string> = {};
  active.forEach((c, i) => (quoteOf[c] = quotes[i]));

  curves.forEach((curve, i) => {
    const quote = quoteOf[curve];
    // Curve trades: the 1% fee split 75/25, and the creator's tax on top.
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
    // After graduation: the pool's 1% LP fee, in both currencies, split 75/25 when collected.
    for (const l of collected[i]) {
      for (const [token, amount] of [[quote, BigInt(l.quoteFees)], [coins[i].token, BigInt(l.tokenFees)]] as [string, bigint][]) {
        const toCreator = creatorPart(amount);
        add(b.dailyFees, token, amount, METRIC.SWAP_FEES);
        add(b.dailyRevenue, token, amount - toCreator, SWAP_FEES_TO_PROTOCOL);
        add(b.dailySupplySideRevenue, token, toCreator, SWAP_FEES_TO_CREATORS);
      }
    }
  });

  return b.result();
};

const fetchEthereum = async (options: FetchOptions) => {
  const b = balances(options);
  const coins = await launches(options, ETH_FACTORIES, ETH_FROM_BLOCK);
  const pools = coins.map((c) => c.curve);

  await addLaunchFees(options, ETH_FACTORIES.map((factory) => ({ factory, launchFee: LAUNCH_FEE })), b);
  // The first set's hook took the creator tax and the launch-block charge outside the pool fee.
  await addHookTaxes(options, [ETH_FIRST_SET_HOOK], b);
  const sniped = await options.getLogs({ target: ETH_FIRST_SET_HOOK, eventAbi: SNIPE_TAXED });
  for (const l of sniped) {
    add(b.dailyFees, String(l.currency), BigInt(l.amount), SNIPE_SURCHARGE);
    add(b.dailySupplySideRevenue, String(l.currency), BigInt(l.amount), SNIPE_SURCHARGE);
  }

  // Packs launched from deposits: every bought seat's bid, half to Packed and half to the launcher,
  // split by the factory in the launch itself.
  const packs = await options.getLogs({ target: ETH_DEPOSIT_FACTORY, eventAbi: PACK_LAUNCHED });
  for (const l of packs) {
    const bids = BigInt(l.bids);
    const toProtocol = BigInt(l.bidsToProtocol);
    add(b.dailyFees, NULL, bids, PACK_BIDS);
    add(b.dailyRevenue, NULL, toProtocol, PACK_BIDS_TO_PROTOCOL);
    add(b.dailySupplySideRevenue, NULL, bids - toProtocol, PACK_BIDS_TO_LAUNCHERS);
  }

  if (!pools.length) return b.result();
  const [collectedV1, collectedV2] = await Promise.all([
    options.getLogs({ targets: pools, eventAbi: FEES_COLLECTED, flatten: false }),
    options.getLogs({ targets: pools, eventAbi: FEES_COLLECTED_V2, flatten: false }),
  ]);
  const active = pools.filter((_, i) => collectedV1[i].length || collectedV2[i].length);
  const quotes = await quoteTokens(options, active);
  const quoteOf: Record<string, string> = {};
  active.forEach((p, i) => (quoteOf[p] = quotes[i]));

  coins.forEach((coin, i) => {
    const quote = quoteOf[coin.curve];
    // First set: the pool fee is the 1% alone, split 75/25 (its tax is read from the hook above).
    for (const l of collectedV1[i]) {
      for (const [token, amount] of [[quote, BigInt(l.quoteFees)], [coin.token, BigInt(l.tokenFees)]] as [string, bigint][]) {
        const toCreator = creatorPart(amount);
        add(b.dailyFees, token, amount, METRIC.SWAP_FEES);
        add(b.dailyRevenue, token, amount - toCreator, SWAP_FEES_TO_PROTOCOL);
        add(b.dailySupplySideRevenue, token, toCreator, SWAP_FEES_TO_CREATORS);
      }
    }
    // Later sets: the LP fee is 1% + the creator tax, and on a hooked pool buys in the launch block
    // pay a surcharge on top. PackedPool.collectFees gives the surcharge to the creator side, and of
    // the rest takes `base = fees * 1% / (1% + tax)` as the 1%, split 75/25, and the remainder as
    // the creator's tax. The same integer arithmetic is repeated here, so the protocol's share
    // matches the Owed events to the wei.
    const restingFee = POOL_BASE_FEE + coin.taxBps * 100n;
    for (const l of collectedV2[i]) {
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
  Fees: "Everything users pay through Packed: the flat 0.0004 ETH launch fee, the 1% fee on every trade on a Packed bonding curve (Robinhood Chain), the 1% LP fee of every Packed coin's Uniswap v4 pool (after graduation on Robinhood Chain, from launch on Ethereum), the creator tax a coin's creator sets at launch (0-5%, on curve trades and pool swaps), the anti-snipe charges of a coin's first seconds or first block, and the bids paid for seats in packs launched from deposits on Ethereum. Pool fees are counted when they are collected from the position.",
  UserFees: "All of the fees above are paid by users: launch fees and bids by creators and pack members, the rest by traders.",
  Revenue: "Packed's share: the launch fee in full, 25% of the 1% curve fee, 25% of the 1% pool fee, and half of every seat bid.",
  ProtocolRevenue: "Same as Revenue; all of it is paid to Packed's fee wallet.",
  SupplySideRevenue: "The creator's 75% of the 1% curve and pool fees, the whole creator tax and anti-snipe charges, and the launcher's half of seat bids. For a reward coin the creator's share goes to the coin's holders instead.",
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
  UserFees: {
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
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.ROBINHOOD]: { fetch: fetchRobinhood, start: "2026-09-04" }, // first launch, block 54350011
    [CHAIN.ETHEREUM]: { fetch: fetchEthereum, start: "2026-09-24" }, // first launch, block 26047618
  },
  // The pool part is Uniswap v4 LP fee: Packed's pools charge their fee as an ordinary LP fee (1%,
  // plus the creator tax on Ethereum) that accrues to the one position Packed holds, and the
  // uniswap-v4 adapter counts that fee from the Swap events on both chains. The curve fees and
  // launch fees are not counted anywhere else, but the flag is set for the whole adapter.
  doublecounted: true,
  methodology,
  breakdownMethodology,
};

export default adapter;
