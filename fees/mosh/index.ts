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
  Refunded: "event Refunded(address indexed contributor, uint256 amount)",
  TeamClaimMinted: "event TeamClaimMinted(address indexed recipient, uint256 claimMinted)",
  ClaimTransferred: "event ClaimTransferred(address indexed from, address indexed to, uint256 amount)",
}
// the Mosh treasury, which also funds bundles itself (it was $BUN's only backer)
const MOSH_TREASURY = "0x6736b8bc65f110e02ca4f681fd84375940f37da6"
const LEGACY_FROM_BLOCK = 52_000_000
const ABI = {
  counterIsNative: "function counterIsNative() view returns (bool)",
  counterAsset: "function counterAsset() view returns (address)",
  treasury: "function treasury() view returns (address)",
  totalClaims: "uint256:totalClaims",
  totalDeposited: "uint256:totalDeposited",
}

const LABELS = {
  creatorFees: "Pons creator fees routed to bundles",
  raiseFees: "Bundle raise fees",
  treasuryShare: "Creator fees to Mosh treasury",
  backerShare: "Creator fees to bundle backers",
  treasuryAsBacker: "Creator fees to Mosh treasury as a bundle backer",
}

// one change to the treasury's fee claim on a swarm
type ClaimMove = { block: number; index: number; delta: bigint }
type Swarm = {
  address: string; native: boolean; counter: string; treasury: string | null
  treasuryFunded: number; claims: ClaimMove[]; totalClaims: bigint
}

const SAFE_RECEIVED_TOPIC = id("SafeReceived(address,uint256)")
const TRANSFER_TOPIC = id("Transfer(address,address,uint256)")
const pad = (a: string) => "0x" + a.toLowerCase().replace(/^0x/, "").padStart(64, "0")

async function getSwarms(options: FetchOptions): Promise<Swarm[]> {
  const created = await options.getLogs({
    targets: FACTORIES, eventAbi: EVENTS.SwarmCreated, fromBlock: FACTORY_FROM_BLOCK, cacheInCloud: true,
  })
  const addresses = [...new Set([...created.map((l: any) => String(l.swarm).toLowerCase()), ...LEGACY_SWARMS])]
  const [native, counter, treasury, totalClaims, totalDeposited] = await Promise.all([
    options.api.multiCall({ abi: ABI.counterIsNative, calls: addresses, permitFailure: true }),
    options.api.multiCall({ abi: ABI.counterAsset, calls: addresses, permitFailure: true }),
    options.api.multiCall({ abi: ABI.treasury, calls: addresses, permitFailure: true }),
    options.api.multiCall({ abi: ABI.totalClaims, calls: addresses, permitFailure: true }),
    options.api.multiCall({ abi: ABI.totalDeposited, calls: addresses, permitFailure: true }),
  ])
  // THE TREASURY CAN BE A BACKER. When Mosh's own treasury holds a bundle's fee claims, its share of
  // the backers' fees is Mosh's revenue, not supply-side revenue, and the raise fee on its own
  // deposits is the treasury paying itself. $BUN: the treasury deposited 8 of 8 ETH and holds the
  // only claim; swarm 0x47bf…00ee minted its 20% team claim to the treasury.
  //
  // Two different fractions, because two different things are split:
  // - the RAISE FEE is charged on deposits: the treasury's part is its deposits over totalDeposited;
  // - FEES are credited pro rata to CLAIMS, which a deposit creates, a team share also mints
  //   (TeamClaimMinted, with no deposit), and which can change hands (ClaimTransferred). The
  //   treasury's part of a sync is its claim at that sync over totalClaims.
  //
  // Both totals are read at the head, which is exact: fees only flow after launch, and from launch
  // on neither total moves (a transfer moves a claim between holders, never the total). The
  // treasury's own claim CAN move, so it is replayed from the events that name it, found by the
  // treasury's indexed address across all contracts: a handful of queries, not a full history of
  // every swarm.
  // Every swarm but the legacy one was created after FACTORY_FROM_BLOCK, so the address-free
  // queries start there; the legacy swarm's own deposits are one targeted query from its era.
  const byTreasury = (eventAbi: string, topics: (string | null)[]) => options.getLogs({
    noTarget: true, eventAbi, topics: topics as any, fromBlock: FACTORY_FROM_BLOCK, cacheInCloud: true, entireLog: true, parseLog: true,
  })
  const T = pad(MOSH_TREASURY)
  const [legacyDeposits, deposits, refunds, teamMints, sentFrom, sentTo] = await Promise.all([
    options.getLogs({
      targets: LEGACY_SWARMS, eventAbi: EVENTS.Deposited, topics: [id("Deposited(address,uint256)"), T] as any,
      fromBlock: LEGACY_FROM_BLOCK, toBlock: FACTORY_FROM_BLOCK, cacheInCloud: true, entireLog: true, parseLog: true,
    }),
    byTreasury(EVENTS.Deposited, [id("Deposited(address,uint256)"), T]),
    byTreasury(EVENTS.Refunded, [id("Refunded(address,uint256)"), T]),
    byTreasury(EVENTS.TeamClaimMinted, [id("TeamClaimMinted(address,uint256)"), T]),
    byTreasury(EVENTS.ClaimTransferred, [id("ClaimTransferred(address,address,uint256)"), T]),
    byTreasury(EVENTS.ClaimTransferred, [id("ClaimTransferred(address,address,uint256)"), null, T]),
  ])
  const known = new Set(addresses)
  const deposited = new Map<string, bigint>()
  const claimsOf = new Map<string, ClaimMove[]>()
  const move = (l: any, delta: bigint) => {
    const sw = String(l.address).toLowerCase()
    if (!known.has(sw)) return
    if (!claimsOf.has(sw)) claimsOf.set(sw, [])
    claimsOf.get(sw)!.push({ block: Number(l.blockNumber), index: Number(l.logIndex ?? l.index ?? 0), delta })
  }
  for (const l of [...legacyDeposits, ...deposits]) {
    const sw = String(l.address).toLowerCase(), a = BigInt(l.args.amount)
    if (known.has(sw)) deposited.set(sw, (deposited.get(sw) ?? 0n) + a)
    move(l, a)
  }
  for (const l of refunds) move(l, -BigInt(l.args.amount))
  for (const l of teamMints) move(l, BigInt(l.args.claimMinted))
  for (const l of sentFrom) move(l, -BigInt(l.args.amount))
  for (const l of sentTo) move(l, BigInt(l.args.amount))
  for (const list of claimsOf.values()) list.sort((x, y) => x.block - y.block || x.index - y.index)
  const fundedShare = (sw: string, i: number) => {
    const t = BigInt(totalDeposited[i] ?? 0)
    return t > 0n ? Number(((deposited.get(sw) ?? 0n) * 1_000_000n) / t) / 1_000_000 : 0
  }
  return addresses.map((address, i) => ({
    address,
    treasuryFunded: fundedShare(address, i),
    claims: claimsOf.get(address) ?? [],
    totalClaims: BigInt(totalClaims[i] ?? 0),
    // the legacy bundle predates counterIsNative(); it is native ETH
    native: native[i] === null || native[i] === undefined ? LEGACY_SWARMS.includes(address) : Boolean(native[i]),
    counter: String(counter[i] ?? "").toLowerCase(),
    treasury: treasury[i] ? String(treasury[i]).toLowerCase() : null,
  }))
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

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
  // the backers' share of a sync split by the treasury's claim over all claims just before that
  // sync, exactly in base units: [Mosh's, the backers']
  const splitByClaims = (amount: bigint | string, s: Swarm, block: number, index: number): [bigint, bigint] => {
    const a = BigInt(amount)
    let mine = 0n
    for (const c of s.claims) {
      if (c.block > block || (c.block === block && c.index >= index)) break
      mine += c.delta
    }
    if (s.totalClaims <= 0n || mine <= 0n) return [0n, a]
    const mosh = (a * (mine > s.totalClaims ? s.totalClaims : mine)) / s.totalClaims
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
    const [moshPart, backersPart] = splitByClaims(toContributors, s, Number(log.blockNumber), Number(log.logIndex ?? log.index ?? 0))
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

  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue }
}

const methodology = {
  Fees: "Pons creator fees paid to Mosh bundles (each bundle's swarm contract), plus the one-time raise fee Mosh takes when a bundle launches. The creator fees are also counted by Pons V2 as its creators' share, so this adapter is marked as double counted.",
  Revenue: "Mosh's share of the creator fees (creatorFeeShareBps, 20% at launch), the raise fee (raiseFeeBps, 5% of the filled raise), and, where the Mosh treasury holds a bundle's fee claims itself, its pro-rata part of the backers' share.",
  ProtocolRevenue: "Mosh's share of the creator fees (creatorFeeShareBps, 20% at launch), the raise fee (raiseFeeBps, 5% of the filled raise), and, where the Mosh treasury holds a bundle's fee claims itself, its pro-rata part of the backers' share.",
  SupplySideRevenue: "The bundle backers' share of the creator fees (80% at launch), including any team share a bundle's creator set out of it, less the part the Mosh treasury holds as a backer.",
}

const breakdownMethodology = {
  Fees: {
    [LABELS.creatorFees]: "The creator share of Pons trading fees on a bundle's token, received by its swarm contract (FeesSynced.received).",
    [LABELS.raiseFees]: "The one-time fee on a bundle's filled raise (5%), paid to the Mosh treasury in the launch transaction. The part of a raise the treasury funded itself is excluded, since that fee is the treasury paying itself.",
  },
  Revenue: {
    [LABELS.treasuryShare]: "Mosh's share of the creator fees, paid to its treasury at each sync (FeesSynced.toTreasury).",
    [LABELS.raiseFees]: "The raise fee, all of it Mosh's.",
    [LABELS.treasuryAsBacker]: "The part of the backers' share credited to the Mosh treasury's own fee claims, in proportion to its claim over all claims at each sync ($BUN: all of it).",
  },
  ProtocolRevenue: {
    [LABELS.treasuryShare]: "Mosh's share of the creator fees, paid to its treasury at each sync (FeesSynced.toTreasury).",
    [LABELS.raiseFees]: "The raise fee, all of it Mosh's.",
    [LABELS.treasuryAsBacker]: "The part of the backers' share credited to the Mosh treasury's own fee claims, in proportion to its claim over all claims at each sync ($BUN: all of it).",
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
  doublecounted: true, // pons v2
  pullHourly: true,
  methodology,
  breakdownMethodology,
}

export default adapter
