// Ryntra (https://ryntra.io) on Solana: the trades people make through Ryntra (listing "Ryntra", a trading app)
// and the tokens they launch with it (listing "Ryntra Launch", a launchpad on Meteora's Dynamic Bonding Curve).
//
// Every Ryntra address below is in Ryntra's public attribution registry, which https://ryntra.io/stats draws and
// https://ryntra.io/api/stats/registry serves as JSON. Each address has one job and is used for nothing else.
// Nothing here reads Ryntra's own records: every figure comes from the transactions themselves.
import ADDRESSES from './coreAssets.json'
import { base58Decode, base58Encode, getSignaturesForAddress, getTransaction, solanaRpc } from './solana'

export const SOL = ADDRESSES.solana.SOL
export const USDC = ADDRESSES.solana.USDC
export const USDT = ADDRESSES.solana.USDT
const STABLES = new Set([USDC, USDT])

export const TRADING_START = Date.UTC(2026, 8, 10) / 1000 // the day of the referral account's first fee (2026-09-10 08:00 UTC)
export const LAUNCH_START = Date.UTC(2026, 9, 6) / 1000 // the day Ryntra Launch opened to people (2026-10-06)

// --- Ryntra: trading fees -----------------------------------------------------------------------------------

// Ryntra's Jupiter referral account (registry id `solana-jupiter-referral`). Swaps through Ryntra's Jupiter
// integration pay the fee into token accounts it owns, since 2026-09-10; the two below are the ones it owns today,
// and any other it opens is found on chain. Jupiter takes 20% of an integrator's referral fee when it is claimed
// (https://developers.jup.ag/docs/swap/order-and-execute#how-it-works).
export const JUPITER_REFERRAL = 'F9pV233uBksW4U1BKiK7u9qShgXkwoR6F8MzU4FZYPUv'
export const JUPITER_REFERRAL_ACCOUNTS: Record<string, string> = {
  A3QWi67fFpQ2PrGXghjLMQdWAkHeN43NbFp9FxpCeorY: SOL, // solana-jupiter-referral-sol
  '55p9Zk8tzq6YhnPgopW5X1sX5kHX1v1zuRiQNwqa5hYH': USDC, // solana-jupiter-referral-usdc
}
export const JUPITER_SHARE_OF_REFERRAL_FEES = 0.2

// Ryntra's fee wallet (registry id `solana-fee-wallet`), since 2026-10-05: Jupiter /build pays Ryntra's whole fee
// into its three token accounts inside the swap; Jupiter takes nothing on /build
// (https://developers.jup.ag/docs/swap/build/index#fees). Only these three accounts count: anyone can open
// another token account for a public wallet and send it anything.
export const FEE_WALLET = '5sWCoxARMPyGdqTu9ru6z69REZ1ZZLojcb1rfABDP2Ne'
export const FEE_WALLET_ACCOUNTS: Record<string, string> = {
  '4kbERimV3PwxwiL72n1NBRpX5HG2Mwja1QNhb4yEp578': SOL,
  GfZQv5L2fAmqNgMsUv97ecV3MUF8GYs7rE7K4ySJDhod: USDC,
  '3QzAhYsiAXEWB64FHwmms63sZcbBKtC1hkPENFMAjMbA': USDT,
}

// --- Ryntra Launch ------------------------------------------------------------------------------------------

export const DBC_PROGRAM = 'dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN'
export const DAMM_V2_PROGRAM = 'cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG'

// The two configs Ryntra Launch creates pools on (registry ids `solana-launch-config-classic` and `-protected`),
// created on 2026-10-05: a 1% curve fee collected in USDC (collect_fee_mode 0), of which Meteora keeps 20% as its
// protocol fee; the rest, the configs' trading fee, goes 40% to the token's creator and 60% to Ryntra as the
// partner. At graduation a 2% migration fee, 60% of it the partner's.
export const LAUNCH_CONFIGS = ['B6gheJ5PL6tpE9V3vQGYA8wLqe3pcFh1fgKf4aPxZh1G', '33KU1WNMVAXLBuGF1EQAHqWFnrsDevofJnw4VAamiK2G']
export const CREATOR_SHARE_PERCENT = 40n
// The wallet that pays for every pool Ryntra Launch creates (`solana-launch-pool-payer`), used for nothing else.
// A pool someone else opens on the same public config is not a Ryntra launch.
export const LAUNCH_POOL_PAYER = 'H2Bzv5pcrEGug1STGbZhvX98DGb3SCFa4pnAtUwktyyV'
// The configs' fee claimer, a Squads vault (`solana-launch-fee-claimer`). Its USDC account is Meteora's referral
// account in the trades made through Ryntra of tokens launched with Ryntra, on the curve and in the pool after
// graduation (`solana-launch-referral-usdc`; the first on chain on 2026-10-06). Counted by the referral fee the
// swap's event states, never by the account's credits: the claimer's own withdrawals land in the same account.
export const LAUNCH_FEE_CLAIMER = '22BZNVD9FuZPQvGwALBwhopSyxUCTuNNeTW1Lr1KsSvA'
export const LAUNCH_REFERRAL_ACCOUNT = '4kVogGhWqheXKjteM2urywUS5L8q7AnSNJCYDna4VrDy'

// Anchor discriminators from the programs' IDLs (@meteora-ag/dynamic-bonding-curve-sdk, @meteora-ag/cp-amm-sdk).
const IX = {
  SWAP: 'f8c69e91e17587c8', // swap, in both programs
  SWAP2: '414b3f4ceb5b5b88', // swap2, in both programs
  INIT_POOL_SPL: '8c55d7b06636684f', // DBC initialize_virtual_pool_with_spl_token
  INIT_POOL_2022: 'a976334e916edc9b', // DBC initialize_virtual_pool_with_token2022
  INIT_POOL_2022_HOOK: 'b60de9b12a918702', // DBC initialize_virtual_pool_with_token2022_transfer_hook
  WITHDRAW_MIGRATION_FEE: 'ed8e2d178106dea2', // DBC withdraw_migration_fee
  PARTNER_WITHDRAW_SURPLUS: 'a8ad4864c962265c', // DBC partner_withdraw_surplus
  CLAIM_POSITION_FEE: 'b4269a118521a2d3', // DAMM v2 claim_position_fee
}
const EVENT_TAG = 'e445a52e51cb9a1d' // emit_cpi! prefix of an event logged as the program's self-invocation
const EVENT = {
  DBC_SWAP: '1b3c15d58aaabb93',
  SWAP2: 'bd4233a826507599', // EvtSwap2, the same name and discriminator in both programs
  WITHDRAW_MIGRATION_FEE: '1acb5455a11764d6',
  PARTNER_WITHDRAW_SURPLUS: 'c3389809e8482316',
  DAMM_CLAIM_POSITION_FEE: 'c6b6b734610c3138',
}
// Account positions inside the instructions (IDL order).
const INIT_POOL_ACCOUNTS: Record<string, { config: number; baseMint: number; quoteMint: number; pool: number; payer: number }> = {
  [IX.INIT_POOL_SPL]: { config: 0, baseMint: 3, quoteMint: 4, pool: 5, payer: 10 },
  [IX.INIT_POOL_2022]: { config: 0, baseMint: 3, quoteMint: 4, pool: 5, payer: 8 },
  [IX.INIT_POOL_2022_HOOK]: { config: 0, baseMint: 3, quoteMint: 4, pool: 5, payer: 9 },
}
// swap and swap2: the pool, its two mints and the referral token account.
const SWAP_ACCOUNTS: Record<string, { pool: number; mintA: number; mintB: number; referral: number }> = {
  [DBC_PROGRAM]: { pool: 2, mintA: 7, mintB: 8, referral: 12 }, // base_mint, quote_mint
  [DAMM_V2_PROGRAM]: { pool: 1, mintA: 6, mintB: 7, referral: 11 }, // token_a_mint, token_b_mint
}

// --- Reading the chain --------------------------------------------------------------------------------------

type Signature = { signature: string; blockTime: number }
type History = { readAt: number; list: Signature[]; before?: string; complete: boolean; queue: Promise<void> }

const histories = new Map<string, History>()
const now = () => Math.floor(Date.now() / 1000)

// The successful signatures of an address back to `from`, newest first. A run reads each address once, from the
// newest signature down to the start of its window, and a later window of the same run extends the same walk; a
// window ending after the walk began starts it again, so a long-lived process never serves a stale list.
async function walk(address: string, from: number, to: number): Promise<Signature[]> {
  let history = histories.get(address)
  if (!history || (to > history.readAt + 60 && now() > history.readAt + 60)) {
    history = { readAt: now(), list: [], complete: false, queue: Promise.resolve() }
    histories.set(address, history)
  }
  const h = history
  h.queue = h.queue.then(async () => {
    while (!h.complete && (h.list.length === 0 || h.list[h.list.length - 1].blockTime >= from)) {
      const page = await getSignaturesForAddress({ address, limit: 1000, before: h.before })
      if (!page?.length) { h.complete = true; break }
      for (const entry of page) {
        if (entry.err) continue
        // A signature the node has not timestamped yet: its transaction says when it landed.
        const blockTime = typeof entry.blockTime === 'number' ? entry.blockTime : (await readTx(entry.signature)).blockTime
        h.list.push({ signature: entry.signature, blockTime })
      }
      h.before = page[page.length - 1].signature
      if (page.length < 1000) h.complete = true
    }
  })
  await h.queue
  return h.list
}

export async function signaturesIn(addresses: string[], from: number, to: number): Promise<string[]> {
  const seen = new Set<string>()
  for (const address of addresses)
    for (const entry of await walk(address, from, to))
      if (entry.blockTime >= from && entry.blockTime < to) seen.add(entry.signature)
  return [...seen]
}

type TokenBalance = { account: string; mint: string; owner?: string; amount: bigint }
type Instruction = { programId: string; accounts: string[]; data: Buffer }
export type Tx = {
  signature: string
  blockTime: number
  signers: string[]
  pre: TokenBalance[]
  post: TokenBalance[]
  lamports: Map<string, bigint> // per account: post - pre
  networkFee: bigint // paid by the first signer
  // Each outer instruction followed by the instructions it invoked, in execution order.
  flows: Instruction[][]
}

const transactions = new Map<string, Promise<Tx>>()

export function readTx(signature: string): Promise<Tx> {
  if (!transactions.has(signature)) {
    const read = (async () => {
      const tx = await getTransaction({ signature, encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 })
      // No transaction, no metadata or no time means the node could not serve it, not that nothing happened.
      if (!tx?.meta || !tx.transaction?.message || typeof tx.blockTime !== 'number') throw new Error(`ryntra: solana rpc returned no transaction for ${signature}`)
      const keys: string[] = tx.transaction.message.accountKeys.map((key: any) => (typeof key === 'string' ? key : key.pubkey))
      const signers = tx.transaction.message.accountKeys.filter((key: any) => key.signer).map((key: any) => key.pubkey)
      const balances = (entries: any[]): TokenBalance[] => (entries ?? []).map((entry) => ({ account: keys[entry.accountIndex], mint: entry.mint, owner: entry.owner, amount: BigInt(entry.uiTokenAmount.amount) }))
      const lamports = new Map<string, bigint>()
      keys.forEach((key, index) => lamports.set(key, BigInt(tx.meta.postBalances[index]) - BigInt(tx.meta.preBalances[index])))
      const instruction = (ix: any): Instruction => ({ programId: ix.programId, accounts: ix.accounts ?? [], data: typeof ix.data === 'string' ? Buffer.from(base58Decode(ix.data)) : Buffer.alloc(0) })
      const flows: Instruction[][] = tx.transaction.message.instructions.map((ix: any, index: number) => {
        const inner = (tx.meta.innerInstructions ?? []).find((group: any) => group.index === index)?.instructions ?? []
        return [instruction(ix), ...inner.map(instruction)]
      })
      return { signature, blockTime: tx.blockTime, signers, networkFee: BigInt(tx.meta.fee ?? 0), pre: balances(tx.meta.preTokenBalances), post: balances(tx.meta.postTokenBalances), lamports, flows }
    })()
    // A failed read is not remembered: the next call asks the node again.
    read.catch(() => transactions.delete(signature))
    transactions.set(signature, read)
  }
  return transactions.get(signature)!
}

const hex = (data: Buffer, start: number, end: number) => data.subarray(start, end).toString('hex')
const u64 = (data: Buffer, offset: number) => data.readBigUInt64LE(offset)
const key = (data: Buffer, offset: number) => base58Encode(data.subarray(offset, offset + 32))
const abs = (value: bigint) => (value < 0n ? -value : value)

// Net movement per mint of the token accounts that match.
function deltas(tx: Tx, match: (entry: TokenBalance) => boolean): Map<string, bigint> {
  const totals = new Map<string, bigint>()
  for (const entry of tx.pre) if (match(entry)) totals.set(entry.mint, (totals.get(entry.mint) ?? 0n) - entry.amount)
  for (const entry of tx.post) if (match(entry)) totals.set(entry.mint, (totals.get(entry.mint) ?? 0n) + entry.amount)
  for (const [mint, amount] of totals) if (amount === 0n) totals.delete(mint)
  return totals
}

// --- Meteora swap events ------------------------------------------------------------------------------------

export type LaunchSwap = {
  program: string
  pool: string
  mintA: string // DBC: the launched token; DAMM v2: token A
  mintB: string // the quote
  buy: boolean // quote in, base out
  quoteVolume: bigint // the quote side of the swap, fee included
  tradingFee: bigint // DBC: the configs' trading fee (creator and partner); DAMM v2: the liquidity's fee
  protocolFee: bigint
  referralFee: bigint
  referralAccount: string | null // the referral token account the swap instruction named
}

// Every Meteora swap in a transaction with its event: the event a program emits is its next self-invocation after
// the swap instruction that caused it.
export function launchSwaps(tx: Tx): LaunchSwap[] {
  const swaps: LaunchSwap[] = []
  for (const flow of tx.flows) {
    const pending: { program: string; pool: string; mintA: string; mintB: string; referral: string | null }[] = []
    for (const ix of flow) {
      if ((ix.programId !== DBC_PROGRAM && ix.programId !== DAMM_V2_PROGRAM) || ix.data.length < 8) continue
      const head = hex(ix.data, 0, 8)
      if (head === IX.SWAP || head === IX.SWAP2) {
        const at = SWAP_ACCOUNTS[ix.programId]
        pending.push({ program: ix.programId, pool: ix.accounts[at.pool], mintA: ix.accounts[at.mintA], mintB: ix.accounts[at.mintB], referral: ix.accounts[at.referral] ?? null })
        continue
      }
      if (head !== EVENT_TAG || ix.data.length < 16) continue
      const event = hex(ix.data, 8, 16)
      const d = ix.data
      let found: Omit<LaunchSwap, 'mintA' | 'mintB' | 'referralAccount'> | null = null
      // Offsets: 8 bytes of tag, 8 of event discriminator, then the fields in IDL order.
      if (ix.programId === DBC_PROGRAM && event === EVENT.DBC_SWAP) {
        // EvtSwap: pool, config, trade_direction, has_referral, {amount_in, minimum_amount_out},
        // {actual_input_amount, output_amount, next_sqrt_price u128, trading_fee, protocol_fee, referral_fee}, amount_in, current_timestamp
        const buy = d[80] === 1
        found = { program: DBC_PROGRAM, pool: key(d, 16), buy, quoteVolume: buy ? u64(d, 154) : u64(d, 106), tradingFee: u64(d, 130), protocolFee: u64(d, 138), referralFee: u64(d, 146) }
      } else if (ix.programId === DBC_PROGRAM && event === EVENT.SWAP2) {
        // EvtSwap2: pool, config, trade_direction, has_referral, {amount_0, amount_1, swap_mode u8},
        // {included_fee_input_amount, excluded_fee_input_amount, amount_left, output_amount, next_sqrt_price u128, trading_fee, protocol_fee, referral_fee}, ...
        const buy = d[80] === 1
        found = { program: DBC_PROGRAM, pool: key(d, 16), buy, quoteVolume: buy ? u64(d, 99) : u64(d, 123), tradingFee: u64(d, 147), protocolFee: u64(d, 155), referralFee: u64(d, 163) }
      } else if (ix.programId === DAMM_V2_PROGRAM && event === EVENT.SWAP2) {
        // EvtSwap2: pool, trade_direction, collect_fee_mode, has_referral, {amount_0, amount_1, swap_mode u8},
        // {included_fee_input_amount, excluded_fee_input_amount, amount_left, output_amount, next_sqrt_price u128, claiming_fee, protocol_fee, compounding_fee, referral_fee}, ...
        const buy = d[48] === 1 // B (the quote) to A
        found = { program: DAMM_V2_PROGRAM, pool: key(d, 16), buy, quoteVolume: buy ? u64(d, 68) : u64(d, 92), tradingFee: u64(d, 116) + u64(d, 132), protocolFee: u64(d, 124), referralFee: u64(d, 140) }
      }
      if (!found) continue
      const at = pending.findIndex((swap) => swap.program === found!.program && swap.pool === found!.pool)
      if (at < 0) continue
      const swap = pending.splice(at, 1)[0]
      swaps.push({ ...found, mintA: swap.mintA, mintB: swap.mintB, referralAccount: swap.referral })
    }
  }
  return swaps
}

// --- Ryntra: the trades made through it ---------------------------------------------------------------------

export type RyntraTrade = {
  signature: string
  blockTime: number
  taker: string
  credits: { identity: 'jupiter-referral' | 'fee-wallet'; mint: string; amount: bigint }[]
  legs: Map<string, bigint> // the taker's own token movements, per mint
  takerLamports: bigint
}

const RENT_CEILING = 3_000_000n // the rent a closed token account returns, at most

// Ryntra's attribution rule, version 1.2.0 — the rule https://ryntra.io/stats counts by, line for line: a
// transaction is a trade through Ryntra when it credited a token account of Ryntra's Jupiter referral account or
// one of the fee wallet's three, and the signer traded. A plain transfer into them is a deposit. Through the fee
// wallet alone the signer must have received something or paid in another mint, and the fee must be at least one
// basis point of the signer's own movement in that asset, so dust sent beside someone else's swap does not make
// it Ryntra's.
export function ryntraTrade(tx: Tx): RyntraTrade | null {
  const credits: RyntraTrade['credits'] = []
  for (const [mint, amount] of deltas(tx, (entry) => entry.owner === JUPITER_REFERRAL)) if (amount > 0n) credits.push({ identity: 'jupiter-referral', mint, amount })
  for (const [mint, amount] of deltas(tx, (entry) => entry.account in FEE_WALLET_ACCOUNTS && FEE_WALLET_ACCOUNTS[entry.account] === entry.mint)) if (amount > 0n) credits.push({ identity: 'fee-wallet', mint, amount })
  if (!credits.length) return null

  // The taker: the first signer, Ryntra's own two aside, whose tokens moved; else the first of them.
  const signers = tx.signers.filter((signer) => signer !== JUPITER_REFERRAL && signer !== FEE_WALLET)
  if (!signers.length) return null
  let taker = signers[0]
  let legs = new Map<string, bigint>()
  for (const signer of signers) {
    const moved = deltas(tx, (entry) => entry.owner === signer)
    if (moved.size) { taker = signer; legs = moved; break }
  }
  const takerLamports = tx.lamports.get(taker) ?? 0n

  // A deposit: every movement of the signer is a debit equal to the fee credited in the same mint.
  const credited = (mint: string) => credits.filter((credit) => credit.mint === mint).reduce((sum, credit) => sum + credit.amount, 0n)
  if (legs.size > 0 && [...legs].every(([mint, amount]) => amount < 0n && credited(mint) === -amount)) return null

  if (!credits.some((credit) => credit.identity === 'jupiter-referral')) {
    const owned = (entries: TokenBalance[]) => new Set(entries.filter((entry) => entry.owner === taker).map((entry) => entry.account))
    const after = owned(tx.post)
    const closed = [...owned(tx.pre)].filter((account) => !after.has(account)).length
    const received = [...legs.values()].some((amount) => amount > 0n) || takerLamports > BigInt(closed) * RENT_CEILING
    const creditedMints = new Set(credits.map((credit) => credit.mint))
    if (!received && ![...legs].some(([mint, amount]) => amount < 0n && !creditedMints.has(mint))) return null
    const sized = credits.every((credit) => {
      let reference = abs(legs.get(credit.mint) ?? 0n)
      if (credit.mint === SOL) reference += abs(takerLamports)
      return reference > 0n && credit.amount * 10_000n >= reference
    })
    if (!sized) return null
  }
  return { signature: tx.signature, blockTime: tx.blockTime, taker, credits, legs, takerLamports }
}

// The trade's size, one side of it, in a token DefiLlama can price: the person's stablecoin leg (what they paid,
// else what they received); when the other side of a single token is SOL, the SOL they paid or received; between
// two other tokens, what they paid. SOL is read as the whole change of the person's wallet and of their token
// accounts, so SOL wrapped and closed inside the swap counts, and the rent of an account the trade opens or closes
// and the network fee do not.
export function tradeSize(trade: RyntraTrade, tx: Tx): { mint: string; amount: bigint } | null {
  const legs = [...trade.legs]
  const stable = legs.find(([mint, amount]) => STABLES.has(mint) && amount < 0n) ?? legs.find(([mint]) => STABLES.has(mint))
  if (stable) return { mint: stable[0], amount: abs(stable[1]) }
  const tokens = legs.filter(([mint]) => mint !== SOL)
  if (tokens.length <= 1) {
    const accounts = new Set([...tx.pre, ...tx.post].filter((entry) => entry.owner === trade.taker).map((entry) => entry.account))
    let sol = trade.takerLamports + (tx.signers[0] === trade.taker ? tx.networkFee : 0n)
    for (const account of accounts) sol += tx.lamports.get(account) ?? 0n
    if (sol !== 0n) return { mint: SOL, amount: abs(sol) }
  }
  const paid = tokens.find(([, amount]) => amount < 0n) ?? tokens[0]
  return paid ? { mint: paid[0], amount: abs(paid[1]) } : null
}

let referralAccounts: Promise<string[]> | null = null

// The token accounts the referral account owns, read from the chain — today the two above.
function referralTokenAccounts(): Promise<string[]> {
  if (!referralAccounts) {
    const read = (async () => {
      const found = new Set(Object.keys(JUPITER_REFERRAL_ACCOUNTS))
      for (const programId of ['TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb']) {
        const { value } = await solanaRpc('getTokenAccountsByOwner', [JUPITER_REFERRAL, { programId }, { encoding: 'base64', dataSlice: { offset: 0, length: 0 } }])
        for (const account of value ?? []) found.add(account.pubkey)
      }
      return [...found]
    })()
    read.catch(() => { referralAccounts = null })
    referralAccounts = read
  }
  return referralAccounts
}

// Every trade through Ryntra in a window, with whether it crossed the bonding curve of a Ryntra launch (that
// volume is Ryntra Launch's).
export async function ryntraTrades(from: number, to: number): Promise<{ trade: RyntraTrade; tx: Tx; onLaunchCurve: boolean }[]> {
  const signatures = await signaturesIn([...(await referralTokenAccounts()), ...Object.keys(FEE_WALLET_ACCOUNTS)], from, to)
  const found: { trade: RyntraTrade; tx: Tx; onLaunchCurve: boolean }[] = []
  let curves: Set<string> | null = null
  for (const signature of signatures) {
    const tx = await readTx(signature)
    const trade = ryntraTrade(tx)
    if (!trade) continue
    const dbc = launchSwaps(tx).filter((swap) => swap.program === DBC_PROGRAM)
    if (dbc.length && !curves) curves = new Set((await launchPools(to)).map((launch) => launch.pool))
    found.push({ trade, tx, onLaunchCurve: dbc.some((swap) => curves!.has(swap.pool)) })
  }
  return found
}

// --- Ryntra Launch: the pools, their trades and Ryntra's income ---------------------------------------------

let pools: { readAt: number; list: Promise<{ pool: string; mint: string }[]> } | null = null

// Every pool Ryntra Launch has created: a Meteora DBC pool initialised on one of its configs, against USDC, paid
// for by its pool payer — with the token it launched. The pool payer does nothing else, so this reads one
// transaction per launch; the list is read once per run.
export function launchPools(to: number): Promise<{ pool: string; mint: string }[]> {
  if (!pools || (to > pools.readAt + 60 && now() > pools.readAt + 60)) {
    const list = (async () => {
      const found = new Map<string, string>()
      for (const signature of await signaturesIn([LAUNCH_POOL_PAYER], LAUNCH_START, now() + 1)) {
        const tx = await readTx(signature)
        for (const flow of tx.flows) for (const ix of flow) {
          if (ix.programId !== DBC_PROGRAM || ix.data.length < 8) continue
          const layout = INIT_POOL_ACCOUNTS[hex(ix.data, 0, 8)]
          if (layout && LAUNCH_CONFIGS.includes(ix.accounts[layout.config]) && ix.accounts[layout.payer] === LAUNCH_POOL_PAYER && ix.accounts[layout.quoteMint] === USDC)
            found.set(ix.accounts[layout.pool], ix.accounts[layout.baseMint])
        }
      }
      return [...found].map(([pool, mint]) => ({ pool, mint }))
    })()
    list.catch(() => { pools = null })
    pools = { readAt: now(), list }
  }
  return pools.list
}

// The swaps on the bonding curves of Ryntra's launches in a window, one per event, whoever made them.
export async function launchCurveSwaps(from: number, to: number): Promise<LaunchSwap[]> {
  const curves = new Set((await launchPools(to)).map((launch) => launch.pool))
  const swaps: LaunchSwap[] = []
  for (const signature of await signaturesIn([...curves], from, to)) {
    for (const swap of launchSwaps(await readTx(signature))) if (swap.program === DBC_PROGRAM && curves.has(swap.pool)) swaps.push(swap)
  }
  return swaps
}

// The trades made through Ryntra of tokens launched with Ryntra: Meteora swaps that name Ryntra Launch's referral
// account, on one of its curves or, after graduation, in a DAMM v2 pool of a launched token against USDC. A swap
// that names the account anywhere else is not counted.
export async function launchReferralSwaps(from: number, to: number): Promise<LaunchSwap[]> {
  const launches = await launchPools(to)
  const curves = new Set(launches.map((launch) => launch.pool))
  const mints = new Set(launches.map((launch) => launch.mint))
  const swaps: LaunchSwap[] = []
  for (const signature of await signaturesIn([LAUNCH_REFERRAL_ACCOUNT], Math.max(from, LAUNCH_START), to)) {
    for (const swap of launchSwaps(await readTx(signature))) {
      if (swap.referralAccount !== LAUNCH_REFERRAL_ACCOUNT || swap.referralFee === 0n || swap.mintB !== USDC) continue
      if (swap.program === DBC_PROGRAM ? curves.has(swap.pool) : mints.has(swap.mintA)) swaps.push(swap)
    }
  }
  return swaps
}

// What Ryntra takes as the partner when a launch graduates, at the moment the fee claimer takes it: its share of
// the migration fee (withdraw_migration_fee as the partner, flag 0) and the surplus above the graduation threshold
// (partner_withdraw_surplus), in USDC; and after graduation the fees of the DAMM v2 liquidity locked for Ryntra
// (claim_position_fee with the claimer as owner), in the launched token and USDC.
export async function partnerIncome(from: number, to: number): Promise<{ kind: 'migration-fee' | 'surplus' | 'position-fees'; mint: string; amount: bigint }[]> {
  const launches = await launchPools(to)
  const curves = new Set(launches.map((launch) => launch.pool))
  const mints = new Set(launches.map((launch) => launch.mint))
  const income: { kind: 'migration-fee' | 'surplus' | 'position-fees'; mint: string; amount: bigint }[] = []
  for (const signature of await signaturesIn([LAUNCH_FEE_CLAIMER], Math.max(from, LAUNCH_START), to)) {
    const tx = await readTx(signature)
    for (const flow of tx.flows) {
      let caller: { head: string; mints?: [string, string] } | null = null
      for (const ix of flow) {
        if ((ix.programId !== DBC_PROGRAM && ix.programId !== DAMM_V2_PROGRAM) || ix.data.length < 8) continue
        const head = hex(ix.data, 0, 8)
        if (head !== EVENT_TAG) {
          // withdraw_migration_fee: virtual_pool 2, sender 6; partner_withdraw_surplus: virtual_pool 2, fee_claimer 6;
          // claim_position_fee: token_a_mint 7, token_b_mint 8.
          if (ix.programId === DBC_PROGRAM && (head === IX.WITHDRAW_MIGRATION_FEE || head === IX.PARTNER_WITHDRAW_SURPLUS))
            caller = curves.has(ix.accounts[2]) && ix.accounts[6] === LAUNCH_FEE_CLAIMER ? { head } : null
          else if (ix.programId === DAMM_V2_PROGRAM && head === IX.CLAIM_POSITION_FEE)
            caller = mints.has(ix.accounts[7]) && ix.accounts[8] === USDC ? { head, mints: [ix.accounts[7], ix.accounts[8]] } : null
          continue
        }
        if (!caller || ix.data.length < 16) continue
        const event = hex(ix.data, 8, 16)
        // EvtWithdrawMigrationFee: pool, fee, flag (0 = the partner). EvtPartnerWithdrawSurplus: pool, surplus_amount.
        if (caller.head === IX.WITHDRAW_MIGRATION_FEE && event === EVENT.WITHDRAW_MIGRATION_FEE && ix.data[56] === 0) income.push({ kind: 'migration-fee', mint: USDC, amount: u64(ix.data, 48) })
        else if (caller.head === IX.PARTNER_WITHDRAW_SURPLUS && event === EVENT.PARTNER_WITHDRAW_SURPLUS) income.push({ kind: 'surplus', mint: USDC, amount: u64(ix.data, 48) })
        // EvtClaimPositionFee: pool, position, owner, fee_a_claimed, fee_b_claimed.
        else if (caller.head === IX.CLAIM_POSITION_FEE && event === EVENT.DAMM_CLAIM_POSITION_FEE && key(ix.data, 80) === LAUNCH_FEE_CLAIMER)
          income.push({ kind: 'position-fees', mint: caller.mints![0], amount: u64(ix.data, 112) }, { kind: 'position-fees', mint: caller.mints![1], amount: u64(ix.data, 120) })
        else continue
        caller = null
      }
    }
  }
  return income.filter((entry) => entry.amount > 0n)
}
