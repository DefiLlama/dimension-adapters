import { id } from "ethers";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Ascend is a token launchpad on Elysium (Kinetiq's chain, id 99901). Every coin trades in
// its own Uniswap V4 launch pool whose hook is the Ascend launchpad. The hook charges a dynamic fee in the pool's pair asset
// (USDC, WHYPE or KNTQ) on every swap. A keeper periodically sends each pool's accrued fees to that coin's CreatorEscrow,
// which splits them and emits Settled. Contract sources are not verified on the explorer; event signatures were
// matched against their on-chain topic0 and the field order against the escrow getters (held(), cumulativeFees()).
const LAUNCHPAD = "0xe0dEF4221b9840a610D4e7d55812a79A6431a8eC"; // AscendLaunchpadV5, the hook on every launch pool
const ESCROW_FACTORY = "0x63f6a8A8d0257c0363251a50cdE8A8b1046e4d19"; // launches every coin (Seat coins included) with its escrow
const POOL_MANAGER = "0xE2e105d3F7209A9DA11f83cCf3E7398a753823F1"; // Uniswap V4 PoolManager on Elysium (launchpad.poolManager())
// Receives the protocol leg of every Settled, pays it out to six fixed legs via distribute(asset).
const PROTOCOL_SPLITTER = "0xFDA2703Df09b23caFfC30dEe6C73b4A12FC82faf";
const DEPLOY_BLOCK = 422319; // first Ascend deployment block, 2026-11-04

// Only the indexed poolId and escrow are used; the names of the other fields are unverified (the coin and pair asset are
// read from the escrow's token() and quote() instead). The escrow emits Settled every time the keeper settles the pool's fees.
const ESCROW_LAUNCHED = "event EscrowLaunched(bytes32 indexed poolId, address indexed escrow, address indexed recipient, address arg3, address arg4, address ruleSet, bool arg6)";
// gross = builder + creator + held + bid + protocol + buyback (checked on every log below)
const SETTLED = "event Settled(uint8 phase, uint8 band, uint256 gross, uint256 builder, uint256 creator, uint256 held, uint256 bid, uint256 protocol, uint256 buyback)";
// OpenZeppelin uniswap-hooks event, emitted by the launchpad after every launch-pool swap; the fee fields are the hook fee.
const HOOK_SWAP = "event HookSwap(bytes32 indexed poolId, address indexed sender, int128 amount0, int128 amount1, uint128 hookLPfeeAmount0, uint128 hookLPfeeAmount1)";
// Part of a sell filled directly by the launchpad's standing bid; this part never reaches the PoolManager Swap.
const FILLED = "event Filled(bytes32 indexed poolId, uint256 tokensIn, uint256 fee, uint256 quoteOut)";
const V4_SWAP = "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)";
const V4_SWAP_TOPIC0 = id("Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)");

const SPLITTER_LEGS = ["teamPpm", "kntqBurnPpm", "strategicKntqPpm", "stakersPpm", "strategicHypePpm", "buybackPpm"];
const PPM = 1_000_000n;

const LABEL = {
  swapFees: "Swap Fees",
  toCreators: "Swap Fees To Creators",
  heldForCreators: "Swap Fees Held For Creators",
  toBuilders: "Swap Fees To Builders",
  toCoinBuybacks: "Swap Fees To Coin Buybacks",
  toStandingBids: "Swap Fees To Standing Bids",
  toTeam: "Swap Fees To Team Treasury",
  toKntqBurn: "Swap Fees To KNTQ Burn",
  toStrategicKntq: "Swap Fees To Strategic KNTQ",
  toStakers: "Swap Fees To Stakers Leg",
  toStrategicHype: "Swap Fees To Strategic HYPE",
};

const lower = (a: string) => String(a).toLowerCase();
const abs = (v: bigint) => (v < 0n ? -v : v);

async function fetch(options: FetchOptions) {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  // ---- every launch: poolId <-> escrow (full history, cached) ----
  const launches = await options.getLogs({ target: ESCROW_FACTORY, eventAbi: ESCROW_LAUNCHED, fromBlock: DEPLOY_BLOCK, cacheInCloud: true });
  const escrowOf: Record<string, string> = {};
  const poolOfEscrow: Record<string, string> = {};
  for (const l of launches) {
    escrowOf[lower(l.poolId)] = lower(l.escrow);
    poolOfEscrow[lower(l.escrow)] = lower(l.poolId);
  }

  // Settled is emitted by thousands of escrows (one per coin) and has no indexed field: scan topic0 and keep Ascend escrows.
  const settledLogs = await options.getLogs({ noTarget: true, eventAbi: SETTLED, onlyArgs: false });
  const hookSwaps = await options.getLogs({ target: LAUNCHPAD, eventAbi: HOOK_SWAP, onlyArgs: false });
  const fills = await options.getLogs({ target: LAUNCHPAD, eventAbi: FILLED });
  const settled = settledLogs.filter((log: any) => poolOfEscrow[lower(log.address)]);

  // ---- pair asset and launched coin of every pool touched in the window (escrow.quote() / token(), immutable) ----
  const pools = [...new Set([
    ...settled.map((log: any) => poolOfEscrow[lower(log.address)]),
    ...hookSwaps.map((log: any) => lower(log.args.poolId)),
    ...fills.map((log: any) => lower(log.poolId)),
  ])];
  for (const p of pools) if (!escrowOf[p]) throw new Error(`Ascend: pool ${p} has no EscrowLaunched log`);
  const escrows = pools.map((p) => escrowOf[p]);
  const quotes = await options.api.multiCall({ abi: "address:quote", calls: escrows });
  const coins = await options.api.multiCall({ abi: "address:token", calls: escrows });
  const quoteOf: Record<string, string> = {};
  const coinOf: Record<string, string> = {};
  pools.forEach((p, i) => { quoteOf[p] = lower(quotes[i]); coinOf[p] = lower(coins[i]); });

  // ---- fees: realized split of every settlement in the window ----
  // Six different getters on one contract: multiCall takes a single abi per batch, so these are plain calls.
  const splitterPpm: any[] = [];
  for (const f of SPLITTER_LEGS) splitterPpm.push(await options.api.call({ target: PROTOCOL_SPLITTER, abi: `uint256:${f}` }));
  const [team, kntqBurn, strategicKntq, stakers, strategicHype, buybackPpm] = splitterPpm.map((v: any) => BigInt(v));
  // ProtocolSplitter shares are fixed in its code (10% / 28.8% / 43.2% / 9% / 9% / 0% buyback).
  if (buybackPpm !== 0n || team + kntqBurn + strategicKntq + stakers + strategicHype !== PPM)
    throw new Error("Ascend: ProtocolSplitter shares changed; review the revenue split");

  for (const log of settled) {
    const quote = quoteOf[poolOfEscrow[lower(log.address)]];
    const { gross, builder, creator, held, bid, protocol, buyback } = log.args;
    const legs = [builder, creator, held, bid, protocol, buyback].map((v: any) => BigInt(v));
    if (legs.reduce((a, b) => a + b, 0n) !== BigInt(gross))
      throw new Error(`Ascend: Settled legs do not sum to gross in tx ${log.transactionHash}`);
    const [toBuilders, toCreators, heldForCreators, toBids, toProtocol, toBuybacks] = legs;

    dailyFees.add(quote, gross, LABEL.swapFees);

    dailySupplySideRevenue.add(quote, toCreators, LABEL.toCreators);
    dailySupplySideRevenue.add(quote, heldForCreators, LABEL.heldForCreators);
    dailySupplySideRevenue.add(quote, toBuilders, LABEL.toBuilders);
    dailySupplySideRevenue.add(quote, toBuybacks, LABEL.toCoinBuybacks);

    // ProtocolSplitter legs; the strategic KNTQ leg takes the integer-division dust so the legs sum to the protocol share.
    const toTeam = toProtocol * team / PPM;
    const toKntqBurn = toProtocol * kntqBurn / PPM;
    const toStakers = toProtocol * stakers / PPM;
    const toStrategicHype = toProtocol * strategicHype / PPM;
    const toStrategicKntq = toProtocol - toTeam - toKntqBurn - toStakers - toStrategicHype;
    const protocolLegs: [bigint, string][] = [
      [toBids, LABEL.toStandingBids],
      [toTeam, LABEL.toTeam],
      [toStrategicKntq, LABEL.toStrategicKntq],
      [toStakers, LABEL.toStakers],
      [toStrategicHype, LABEL.toStrategicHype],
    ];
    for (const [amount, label] of protocolLegs) {
      dailyRevenue.add(quote, amount, label);
      dailyProtocolRevenue.add(quote, amount, label);
    }
    dailyRevenue.add(quote, toKntqBurn, LABEL.toKntqBurn);
    dailyHoldersRevenue.add(quote, toKntqBurn, LABEL.toKntqBurn);
  }

  // ---- volume: launch-pool swaps, in the pair asset, gross of the hook fee ----
  // Every launch-pool Swap is followed in the same tx by one HookSwap for that pool. On a buy the hook takes its fee from the
  // input before the swap, so the Swap amount is net of it and the fee from the matching HookSwap is added back. On a sell
  // the fee comes out of the output after the swap, so the Swap amount is already gross.
  const hookSwapsByKey: Record<string, any[]> = {};
  for (const log of hookSwaps) (hookSwapsByKey[`${lower(log.transactionHash)}-${lower(log.args.poolId)}`] ??= []).push(log);

  const activePools = [...new Set(hookSwaps.map((log: any) => lower(log.args.poolId)))];
  const swaps: any[] = [];
  for (let i = 0; i < activePools.length; i += 200) {
    const chunk = activePools.slice(i, i + 200);
    swaps.push(...await options.getLogs({ target: POOL_MANAGER, eventAbi: V4_SWAP, topics: [V4_SWAP_TOPIC0, chunk] as any, onlyArgs: false }));
  }

  for (const swap of swaps) {
    const pool = lower(swap.args.id);
    const quote = quoteOf[pool];
    const quoteIs0 = quote < coinOf[pool]; // Uniswap V4 sorts currency0 < currency1
    const amount = BigInt(quoteIs0 ? swap.args.amount0 : swap.args.amount1);
    dailyVolume.add(quote, abs(amount));
    if (amount >= 0n) continue; // sell: pool paid the quote out, already gross
    // The creator's initial buy is swapped by the launchpad itself inside the launch tx and pays no hook fee
    // (e.g. 0xf1d8639cd1c24e8dafdb32a0fdb3938053f4e4bba11122681b93cfeecedda2cf).
    if (lower(swap.args.sender) === lower(LAUNCHPAD)) continue;
    const hookSwap = (hookSwapsByKey[`${lower(swap.transactionHash)}-${pool}`] ?? [])
      .filter((h) => Number(h.logIndex) > Number(swap.logIndex))
      .sort((a, b) => Number(a.logIndex) - Number(b.logIndex))[0];
    if (!hookSwap) throw new Error(`Ascend: no HookSwap after buy in tx ${swap.transactionHash}`);
    dailyVolume.add(quote, quoteIs0 ? hookSwap.args.hookLPfeeAmount0 : hookSwap.args.hookLPfeeAmount1);
  }

  // Standing-bid fills: the seller received quoteOut after the fee was taken.
  for (const fill of fills) dailyVolume.add(quoteOf[lower(fill.poolId)], BigInt(fill.quoteOut) + BigInt(fill.fee));

  return { dailyVolume, dailyFees, dailyUserFees: dailyFees.clone(), dailyRevenue, dailySupplySideRevenue, dailyProtocolRevenue, dailyHoldersRevenue };
}

const methodology = {
  Volume: "Value of all trades in Ascend launch pools, including sells filled by the launchpad's standing bids, measured in the pool's pair asset (USDC, HYPE or KNTQ) before the trading fee.",
  Fees: "Trading fees charged by the Ascend launchpad on every launch-pool trade, counted when they are settled to each coin's creator escrow (normally within an hour of the trade).",
  UserFees: "Trading fees paid by traders on every Ascend launch-pool trade.",
  Revenue: "The part of trading fees sent to the Ascend protocol splitter, plus the part used by the launchpad's standing bids to buy launched coins into protocol treasuries.",
  SupplySideRevenue: "The part of trading fees paid to coin creators (including the share held in escrow until a coin graduates), to builders who brought the launch, and to buybacks of the launched coin.",
  ProtocolRevenue: "The protocol splitter's team, strategic KNTQ, stakers and strategic HYPE legs, plus standing-bid buys of launched coins into protocol treasuries. The stakers leg is held in a protocol treasury while staking is not live.",
  HoldersRevenue: "The 28.8% of the protocol splitter's share set aside to burn KNTQ.",
};

const breakdownMethodology = {
  Fees: {
    [LABEL.swapFees]: "Dynamic hook fee charged in the pair asset on every launch-pool trade, from the gross amount of each escrow Settled event.",
  },
  UserFees: {
    [LABEL.swapFees]: "Dynamic hook fee paid by traders on every launch-pool trade.",
  },
  Revenue: {
    [LABEL.toStandingBids]: "Share of fees funding the launchpad's standing bids, which buy launched coins into the Ascend cohort and inventory treasuries.",
    [LABEL.toTeam]: "10% of the protocol splitter's share, sent to the team treasury.",
    [LABEL.toKntqBurn]: "28.8% of the protocol splitter's share, sent to the KNTQ burn treasury.",
    [LABEL.toStrategicKntq]: "43.2% of the protocol splitter's share, sent to the ecosystem allocator for strategic KNTQ.",
    [LABEL.toStakers]: "9% of the protocol splitter's share reserved for stakers, held in a protocol treasury while staking is not live.",
    [LABEL.toStrategicHype]: "9% of the protocol splitter's share, sent to the protocol-owned HYPE treasury.",
  },
  ProtocolRevenue: {
    [LABEL.toStandingBids]: "Share of fees funding the launchpad's standing bids, which buy launched coins into the Ascend cohort and inventory treasuries.",
    [LABEL.toTeam]: "10% of the protocol splitter's share, sent to the team treasury.",
    [LABEL.toStrategicKntq]: "43.2% of the protocol splitter's share, sent to the ecosystem allocator for strategic KNTQ.",
    [LABEL.toStakers]: "9% of the protocol splitter's share reserved for stakers, held in a protocol treasury while staking is not live.",
    [LABEL.toStrategicHype]: "9% of the protocol splitter's share, sent to the protocol-owned HYPE treasury.",
  },
  HoldersRevenue: {
    [LABEL.toKntqBurn]: "28.8% of the protocol splitter's share, sent to the KNTQ burn treasury.",
  },
  SupplySideRevenue: {
    [LABEL.toCreators]: "Share of fees credited to the coin's creator (or its Holder Rewards / Buyback seat).",
    [LABEL.heldForCreators]: "Creator share held in the escrow before a coin graduates; released to the creator on graduation or forfeited if the coin misses its deadline.",
    [LABEL.toBuilders]: "Builder fee paid to the partner that brought the launch.",
    [LABEL.toCoinBuybacks]: "Share of fees set aside to buy back the launched coin.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ELYSIUM],
  start: "2026-11-04",
  methodology,
  breakdownMethodology,
};

export default adapter;
