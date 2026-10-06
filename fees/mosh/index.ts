import { ChainApi } from "@defillama/sdk";
import { id } from "ethers";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Mosh (mosh.trade) launches tokens on Pons through community-funded "bundles". Each bundle is a
// PonsSwarm contract: backers fund a raise, the swarm buys the launch on Pons, and the creator
// share of the Pons pool's trading fees is paid to the swarm, which splits it between Mosh's
// treasury and the bundle's backers.
//
// Those creator fees are already counted by the Pons V2 adapter (PoolFeesSwept.creatorAmount, as
// Pons supply-side revenue), so this adapter is marked doublecounted: it shows the Mosh layer on
// top of Pons, and must not add to Robinhood Chain's fee total a second time.
//
// Every amount is in the swarm's own counter asset: native ETH on most bundles, an ERC20 on the
// rest (BUN, USDG, tokenized stocks...). Nothing is converted here; balances carry the token.

// PonsSwarm factories, one per counter asset; each emits SwarmCreated for every bundle
const FACTORIES = [
  "0x9073cb17846398fb8b379ab06c2b840dea7f0069", // native ETH
  "0xe5ec3e5f288036526112415385e4ce3331012887",
  "0xd32f988aa0d7e202c31f0bb0b3f8372adacc329b",
  "0x3c4cb58ef0f5b2f4d4b2cc786d51769ff4af5fe4",
  "0xea2594c7fbf4c443c023ef07899779b936395402",
  "0xa7634db2c4e54984be05a22287c42858358190e4",
  "0x290f546f96449449118f9fbb42465fddc2020f3f",
  "0xc9793e938198fede4d4877f4a09f24f0f377dde6",
  "0xf6d2268d5ebd75d15553ad275f2ec9147b6f4350", // BUN
]
const FACTORY_FROM_BLOCK = 70_000_000
// the first bundle ($BUN), created before the factories above by the original deployment
const LEGACY_SWARMS = ["0x7bdb0b02f41ca6644750b9e6ae75de08f1bc6d01"]
// the legacy bundle predates the Launched event, so its launch is named here: $BUN, its Pons curve,
// and the block of its TokenLaunched on the Pons factory
const LEGACY_LAUNCHES = [{
  swarm: "0x7bdb0b02f41ca6644750b9e6ae75de08f1bc6d01", memecoin: "0x07ebb29a38fbcb41563817e5e19f2cec619c90d2",
  curve: "0x62e4aa27046b0cbd28d76d0ec7c56c5a32ce3af4", block: 52_687_031,
}]
// the legacy bundle predates the Launched event; its raise fee (0.4 ETH at block 52,687,031, tx
// 0x3e9dcd19093da517aa3001975828065c846d785a4ac7858af76d52d4eec90914) is NOT counted: the Mosh
// treasury funded the whole 8 ETH raise, so that fee was the treasury paying itself

const EVENTS = {
  SwarmCreated: "event SwarmCreated(address indexed swarm, address indexed creator, uint256 index, bytes32 launchParamsHash)",
  FeesSynced: "event FeesSynced(uint256 received, uint256 toTreasury, uint256 toContributors)",
  Launched: "event Launched(address indexed memecoin, address indexed curve, uint256 principal, uint256 bundleReceived)",
  SafeReceived: "event SafeReceived(address indexed sender, uint256 value)",
  Transfer: "event Transfer(address indexed from, address indexed to, uint256 value)",
  Deposited: "event Deposited(address indexed contributor, uint256 amount)",
  Initialize: "event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)",
  Swap: "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)",
  CurveBuy: "event CurveBuy(address indexed a, address indexed b, uint256 amount0, uint256 amount1, uint256 fee, uint256 tax)",
  CurveSell: "event CurveSell(address indexed a, address indexed b, uint256 amount0, uint256 amount1, uint256 fee, uint256 tax)",
}
// Robinhood Chain's Uniswap v4 PoolManager, and the Pons hook every graduated Pons pool carries
const POOL_MANAGER = "0x8366a39cc670b4001a1121b8f6a443a643e40951"
const PONS_HOOK = "0xe5e702641ea86f4ae6cc3cdaed2b886f976be044"
// the Mosh treasury, which also funds bundles itself (it was $BUN's only backer)
const MOSH_TREASURY = "0x6736b8bc65f110e02ca4f681fd84375940f37da6"
const LEGACY_FROM_BLOCK = 52_000_000
const ABI = {
  counterIsNative: "function counterIsNative() view returns (bool)",
  counterAsset: "function counterAsset() view returns (address)",
  treasury: "function treasury() view returns (address)",
}

const LABELS = {
  creatorFees: "Pons creator fees routed to bundles",
  raiseFees: "Bundle raise fees",
  treasuryShare: "Creator fees to Mosh treasury",
  backerShare: "Creator fees to bundle backers",
  treasuryAsBacker: "Creator fees to Mosh treasury as a bundle backer",
  curveVolume: "Bonding curve trades",
  poolVolume: "Graduated pool trades",
}

type Swarm = { address: string; native: boolean; counter: string; treasury: string | null; treasuryFunded: number }

const SAFE_RECEIVED_TOPIC = id("SafeReceived(address,uint256)")
const TRANSFER_TOPIC = id("Transfer(address,address,uint256)")
const INITIALIZE_TOPIC = id("Initialize(bytes32,address,address,uint24,int24,address,uint160,int24)")
const SWAP_TOPIC = id("Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)")
const ZERO = "0x0000000000000000000000000000000000000000"
const pad = (a: string) => "0x" + a.toLowerCase().replace(/^0x/, "").padStart(64, "0")

async function getSwarms(options: FetchOptions): Promise<Swarm[]> {
  const created = await options.getLogs({
    targets: FACTORIES, eventAbi: EVENTS.SwarmCreated, fromBlock: FACTORY_FROM_BLOCK, cacheInCloud: true,
  })
  const addresses = [...new Set([...created.map((l: any) => String(l.swarm).toLowerCase()), ...LEGACY_SWARMS])]
  // a swarm's counter asset and treasury are fixed at creation: read them at the chain head, which
  // the node can always answer (Robinhood Chain's public RPC does not keep old state)
  const api = new ChainApi({ chain: options.chain })
  const [native, counter, treasury] = await Promise.all([
    api.multiCall({ abi: ABI.counterIsNative, calls: addresses, permitFailure: true }),
    api.multiCall({ abi: ABI.counterAsset, calls: addresses, permitFailure: true }),
    api.multiCall({ abi: ABI.treasury, calls: addresses, permitFailure: true }),
  ])
  // THE TREASURY CAN BE A BACKER. When Mosh's own treasury funds a bundle, the backers' share of
  // its fees is Mosh's revenue, not supply-side revenue, and the raise fee is the treasury paying
  // itself. Each bundle's treasury-funded fraction is its treasury deposits over all its deposits
  // (raises are closed by the time fees flow, so the fraction is fixed). $BUN: 8 of 8 ETH.
  const deposits = await options.getLogs({
    targets: addresses, eventAbi: EVENTS.Deposited, fromBlock: LEGACY_FROM_BLOCK, cacheInCloud: true, entireLog: true, parseLog: true,
  })
  const total = new Map<string, bigint>(), fromTreasury = new Map<string, bigint>()
  for (const d of deposits) {
    const sw = String(d.address).toLowerCase()
    const amount = BigInt(d.args.amount)
    total.set(sw, (total.get(sw) ?? 0n) + amount)
    if (String(d.args.contributor).toLowerCase() === MOSH_TREASURY) fromTreasury.set(sw, (fromTreasury.get(sw) ?? 0n) + amount)
  }
  const fundedShare = (sw: string) => {
    const t = total.get(sw) ?? 0n
    return t > 0n ? Number(((fromTreasury.get(sw) ?? 0n) * 1_000_000n) / t) / 1_000_000 : 0
  }
  return addresses.map((address, i) => ({
    address,
    treasuryFunded: fundedShare(address),
    // the legacy bundle predates counterIsNative(); it is native ETH
    native: native[i] === null || native[i] === undefined ? LEGACY_SWARMS.includes(address) : Boolean(native[i]),
    counter: String(counter[i] ?? "").toLowerCase(),
    treasury: treasury[i] ? String(treasury[i]).toLowerCase() : null,
  }))
}

// LAUNCH VOLUME: every trade in a Mosh-launched token, in the bundle's counter asset. A launch trades
// first on its Pons bonding curve (CurveBuy/CurveSell, emitted by the curve) and, once it graduates,
// in a Uniswap v4 pool carrying the Pons hook (Swap on the PoolManager, by pool id). Pons V2 counts
// the curve trades and Uniswap v4 the pool trades, so this is double counted like the fees.
async function addLaunchVolume(options: FetchOptions, swarms: Swarm[], dailyVolume: any) {
  const byAddress = new Map(swarms.map((s) => [s.address, s]))
  const launched = await options.getLogs({
    targets: swarms.map((s) => s.address), eventAbi: EVENTS.Launched, fromBlock: FACTORY_FROM_BLOCK, cacheInCloud: true,
    entireLog: true, parseLog: true,
  })
  const launches = [
    ...LEGACY_LAUNCHES,
    ...launched.map((l: any) => ({
      swarm: String(l.address).toLowerCase(), memecoin: String(l.args.memecoin).toLowerCase(),
      curve: String(l.args.curve).toLowerCase(), block: Number(l.blockNumber),
    })),
  ].filter((l) => byAddress.has(l.swarm))
  const toBlock = await options.getToBlock()
  const add = (s: Swarm, amount: bigint, label: string) => {
    if (amount <= 0n) return
    if (s.native) dailyVolume.addGasToken(amount, label)
    else if (s.counter) dailyVolume.add(s.counter, amount, label)
  }

  // the curve: quote in on a buy, quote out plus the fee and tax it paid on a sell (Pons V2's measure)
  const curveOf = new Map(launches.map((l) => [l.curve, byAddress.get(l.swarm)!]))
  const curves = [...curveOf.keys()]
  const [buys, sells] = await Promise.all([
    options.getLogs({ targets: curves, eventAbi: EVENTS.CurveBuy, entireLog: true, parseLog: true }),
    options.getLogs({ targets: curves, eventAbi: EVENTS.CurveSell, entireLog: true, parseLog: true }),
  ])
  for (const l of buys) {
    const s = curveOf.get(String(l.address).toLowerCase())
    if (s) add(s, BigInt(l.args.amount0), LABELS.curveVolume)
  }
  for (const l of sells) {
    const s = curveOf.get(String(l.address).toLowerCase())
    if (s) add(s, BigInt(l.args.amount1) + BigInt(l.args.fee) + BigInt(l.args.tax), LABELS.curveVolume)
  }

  // the graduated pool: found by its Initialize (topic 1 is the pool id, topics 2 and 3 the two
  // currencies, so one exact query per launch, from its launch block), kept only when it carries the
  // Pons hook: anyone can open another pool on the pair, and one nobody trades in can be wash-traded
  for (const l of launches) {
    if (l.block > toBlock) continue
    const s = byAddress.get(l.swarm)!
    const counter = s.native ? ZERO : s.counter
    if (!counter) continue
    const [c0, c1] = BigInt(counter) < BigInt(l.memecoin) ? [counter, l.memecoin] : [l.memecoin, counter]
    const inits = await options.getLogs({
      target: POOL_MANAGER, eventAbi: EVENTS.Initialize, topics: [INITIALIZE_TOPIC, null as any, pad(c0), pad(c1)],
      fromBlock: l.block, toBlock, cacheInCloud: true, entireLog: true, parseLog: true,
    })
    const pool = inits.find((i: any) => String(i.args.hooks).toLowerCase() === PONS_HOOK)
    if (!pool) continue
    const counterIs0 = c0 === counter
    const swaps = await options.getLogs({
      target: POOL_MANAGER, eventAbi: EVENTS.Swap, topics: [SWAP_TOPIC, String(pool.args.id)], entireLog: true, parseLog: true,
    })
    for (const w of swaps) {
      const amount = BigInt(counterIs0 ? w.args.amount0 : w.args.amount1)
      add(s, amount < 0n ? -amount : amount, LABELS.poolVolume)
    }
  }
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()
  const dailyVolume = options.createBalances()

  const swarms = await getSwarms(options)
  const byAddress = new Map(swarms.map((s) => [s.address, s]))
  const add = (balances: any, s: Swarm, amount: bigint | string, label: string) => {
    if (BigInt(amount) <= 0n) return
    if (s.native) balances.addGasToken(amount, label)
    else if (s.counter) balances.add(s.counter, amount, label)
  }
  // an amount split by the treasury-funded fraction, exactly in base units: [Mosh's, the rest]
  const split = (amount: bigint | string, share: number): [bigint, bigint] => {
    const a = BigInt(amount)
    const mosh = (a * BigInt(Math.round(share * 1_000_000))) / 1_000_000n
    return [mosh, a - mosh]
  }

  // the fee stream: every sync splits what the swarm received into Mosh's share and the backers'
  const synced = await options.getLogs({
    targets: swarms.map((s) => s.address), eventAbi: EVENTS.FeesSynced, entireLog: true, parseLog: true,
  })
  for (const log of synced) {
    const s = byAddress.get(String(log.address).toLowerCase())
    if (!s) continue
    const { received, toTreasury, toContributors } = log.args
    add(dailyFees, s, received, LABELS.creatorFees)
    add(dailyRevenue, s, toTreasury, LABELS.treasuryShare)
    add(dailyProtocolRevenue, s, toTreasury, LABELS.treasuryShare)
    // the backers' share: the treasury's part of it is Mosh's revenue, the rest the backers'
    const [moshPart, backersPart] = split(toContributors, s.treasuryFunded)
    add(dailyRevenue, s, moshPart, LABELS.treasuryAsBacker)
    add(dailyProtocolRevenue, s, moshPart, LABELS.treasuryAsBacker)
    add(dailySupplySideRevenue, s, backersPart, LABELS.backerShare)
  }

  // the raise fee: taken once, at launch, from the filled raise and paid to the treasury in the
  // launch transaction itself. There is no event of its own, so it is the treasury's receipt from
  // the swarm in that transaction: SafeReceived for native ETH, the counter's Transfer otherwise.
  const launched = await options.getLogs({
    targets: swarms.map((s) => s.address), eventAbi: EVENTS.Launched, entireLog: true, parseLog: true,
  })
  for (const log of launched) {
    const s = byAddress.get(String(log.address).toLowerCase())
    if (!s || !s.treasury) continue
    const tx = String(log.transactionHash).toLowerCase()
    const receipts = s.native
      ? await options.getLogs({
        target: s.treasury, eventAbi: EVENTS.SafeReceived, topics: [SAFE_RECEIVED_TOPIC, pad(s.address)],
        entireLog: true, parseLog: true,
      })
      : await options.getLogs({
        target: s.counter, eventAbi: EVENTS.Transfer, topics: [TRANSFER_TOPIC, pad(s.address), pad(s.treasury)],
        entireLog: true, parseLog: true,
      })
    for (const r of receipts) {
      if (String(r.transactionHash).toLowerCase() !== tx) continue
      // the treasury-funded part of a raise fee is the treasury paying itself: not a fee
      const [, amount] = split(r.args.value, s.treasuryFunded)
      add(dailyFees, s, amount, LABELS.raiseFees)
      add(dailyRevenue, s, amount, LABELS.raiseFees)
      add(dailyProtocolRevenue, s, amount, LABELS.raiseFees)
    }
  }

  await addLaunchVolume(options, swarms, dailyVolume)

  return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue }
}

const methodology = {
  Volume: "Trading volume of every token launched through Mosh, in each bundle's counter asset: trades on the token's Pons bonding curve, then on its graduated Uniswap v4 pool (the one carrying the Pons hook). Pons V2 and Uniswap v4 count the same trades, so this adapter is marked as double counted.",
  Fees: "Pons creator fees paid to Mosh bundles (each bundle's swarm contract), plus the one-time raise fee Mosh takes when a bundle launches. The creator fees are also counted by Pons V2 as its creators' share, so this adapter is marked as double counted.",
  Revenue: "Mosh's share of the creator fees (creatorFeeShareBps, 20% at launch), the raise fee (raiseFeeBps, 5% of the filled raise), and the backers' share of bundles the Mosh treasury funded itself, in proportion to its deposits.",
  ProtocolRevenue: "All of Mosh's revenue goes to the Mosh treasury.",
  SupplySideRevenue: "The bundle backers' share of the creator fees (80% at launch), including any team share a bundle's creator set out of it, less the part the Mosh treasury holds as a backer.",
}

const breakdownMethodology = {
  Volume: {
    [LABELS.curveVolume]: "Buys and sells on the token's Pons bonding curve before it graduates: the quote paid on a buy, the quote received plus fee and tax on a sell.",
    [LABELS.poolVolume]: "Swaps in the token's graduated Uniswap v4 pool, the counter-asset side of each swap.",
  },
  Fees: {
    [LABELS.creatorFees]: "The creator share of Pons trading fees on a bundle's token, received by its swarm contract (FeesSynced.received).",
    [LABELS.raiseFees]: "The one-time fee on a bundle's filled raise (5%), paid to the Mosh treasury in the launch transaction. The part of a raise the treasury funded itself is excluded, since that fee is the treasury paying itself.",
  },
  Revenue: {
    [LABELS.treasuryShare]: "Mosh's share of the creator fees, paid to its treasury at each sync (FeesSynced.toTreasury).",
    [LABELS.raiseFees]: "The raise fee, all of it Mosh's.",
    [LABELS.treasuryAsBacker]: "The backers' share of the creator fees on bundles the Mosh treasury funded, in proportion to its deposits ($BUN: all of it).",
  },
  ProtocolRevenue: {
    [LABELS.treasuryShare]: "Mosh's share of the creator fees, paid to its treasury at each sync (FeesSynced.toTreasury).",
    [LABELS.raiseFees]: "The raise fee, all of it Mosh's.",
    [LABELS.treasuryAsBacker]: "The backers' share of the creator fees on bundles the Mosh treasury funded, in proportion to its deposits ($BUN: all of it).",
  },
  SupplySideRevenue: {
    [LABELS.backerShare]: "The backers' share of the creator fees, credited to their claims at each sync (FeesSynced.toContributors), less the treasury's part as a backer.",
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-09-02",
  doublecounted: true,
  methodology,
  breakdownMethodology,
}

export default adapter
