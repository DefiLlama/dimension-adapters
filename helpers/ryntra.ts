// Ryntra (https://ryntra.io) on Solana: the trades people make through Ryntra and the tokens they launch with it.
//
// Every address below is in Ryntra's public attribution registry, which https://ryntra.io/stats draws and
// https://ryntra.io/api/stats/registry serves as JSON. Each address has one job and is used for nothing else.
// Nothing here reads Ryntra's own records: every figure comes from the transactions themselves.
import ADDRESSES from './coreAssets.json'
import { base58Decode, base58Encode, getSignaturesForAddress, getTransaction } from './solana'

export const SOL = ADDRESSES.solana.SOL
export const USDC = ADDRESSES.solana.USDC
export const USDT = ADDRESSES.solana.USDT
const STABLES = new Set([USDC, USDT])

// --- Trading fees -------------------------------------------------------------------------------------------

// Ryntra's Jupiter referral account (registry id `solana-jupiter-referral`) and the token accounts it owns.
// Swaps through Ryntra's Jupiter integration pay the fee into them since 2026-09-10. The referral project
// keeps 80% for Ryntra; Jupiter takes 20% of an integrator fee
// (https://developers.jup.ag/docs/swap/order-and-execute#how-it-works).
export const JUPITER_REFERRAL = 'F9pV233uBksW4U1BKiK7u9qShgXkwoR6F8MzU4FZYPUv'
export const JUPITER_REFERRAL_ACCOUNTS: Record<string, string> = {
  A3QWi67fFpQ2PrGXghjLMQdWAkHeN43NbFp9FxpCeorY: SOL, // solana-jupiter-referral-sol
  '55p9Zk8tzq6YhnPgopW5X1sX5kHX1v1zuRiQNwqa5hYH': USDC, // solana-jupiter-referral-usdc
}
export const JUPITER_SHARE_OF_REFERRAL_FEES = 0.2

// Ryntra's fee wallet (registry id `solana-fee-wallet`), since 2026-10-05: Jupiter /build pays Ryntra's whole fee
// into its three token accounts inside the swap. Jupiter takes nothing on /build
// (https://developers.jup.ag/docs/swap/build/index#fees). Only these three accounts count: anyone can open
// another token account for a public wallet and send it anything.
export const FEE_WALLET = '5sWCoxARMPyGdqTu9ru6z69REZ1ZZLojcb1rfABDP2Ne'
export const FEE_WALLET_ACCOUNTS: Record<string, string> = {
  '4kbERimV3PwxwiL72n1NBRpX5HG2Mwja1QNhb4yEp578': SOL,
  GfZQv5L2fAmqNgMsUv97ecV3MUF8GYs7rE7K4ySJDhod: USDC,
  '3QzAhYsiAXEWB64FHwmms63sZcbBKtC1hkPENFMAjMbA': USDT,
}

// --- Ryntra Launch (Meteora Dynamic Bonding Curve) ----------------------------------------------------------

export const DBC_PROGRAM = 'dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN'
export const DAMM_V2_PROGRAM = 'cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG'

// The two configs Ryntra Launch creates pools on (registry ids `solana-launch-config-classic` and
// `-protected`), created on 2026-10-05: fees collected in USDC (collect_fee_mode 0), the creator's share of the
// trading fee 40%, the rest to Ryntra as the config's partner.
export const LAUNCH_CONFIGS = ['B6gheJ5PL6tpE9V3vQGYA8wLqe3pcFh1fgKf4aPxZh1G', '33KU1WNMVAXLBuGF1EQAHqWFnrsDevofJnw4VAamiK2G']
export const CREATOR_SHARE_PERCENT = 40n
// The wallet that pays for every pool Ryntra Launch creates (`solana-launch-pool-payer`), used for nothing else.
// A pool someone else opens on the same public config is not a Ryntra launch.
export const LAUNCH_POOL_PAYER = 'H2Bzv5pcrEGug1STGbZhvX98DGb3SCFa4pnAtUwktyyV'
// The configs' fee claimer, a Squads vault (`solana-launch-fee-claimer`); its USDC account is Meteora's referral
// account in the trades made through Ryntra on a launched token (`solana-launch-referral-usdc`; the first on chain
// on 2026-10-06, every one since 2026-10-08). Counted by the referral fee the swap's event states, never by the
// account's credits: the claimer's claims land in the same account.
export const LAUNCH_FEE_CLAIMER = '22BZNVD9FuZPQvGwALBwhopSyxUCTuNNeTW1Lr1KsSvA'
export const LAUNCH_REFERRAL_ACCOUNT = '4kVogGhWqheXKjteM2urywUS5L8q7AnSNJCYDna4VrDy'

// Anchor discriminators from the programs' IDLs (@meteora-ag/dynamic-bonding-curve-sdk, @meteora-ag/cp-amm-sdk).
const IX = {
  SWAP: 'f8c69e91e17587c8', // swap, in both programs
  SWAP2: '414b3f4ceb5b5b88', // swap2, in both programs
  INIT_POOL_SPL: '8c55d7b06636684f', // DBC initialize_virtual_pool_with_spl_token
  INIT_POOL_2022: 'a976334e916edc9b', // DBC initialize_virtual_pool_with_token2022
  INIT_POOL_2022_HOOK: 'b60de9b12a918702', // DBC initialize_virtual_pool_with_token2022_transfer_hook
  CLAIM_POSITION_FEE: 'b4269a118521a2d3', // DAMM v2 claim_position_fee
}
const EVENT_TAG = 'e445a52e51cb9a1d' // emit_cpi! prefix on an event logged as a self-invocation
const EVENT = {
  DBC_SWAP: '1b3c15d58aaabb93',
  SWAP2: 'bd4233a826507599', // EvtSwap2, the same name and discriminator in both programs
  DAMM_CLAIM_POSITION_FEE: 'c6b6b734610c3138',
}
// Account positions inside the instructions (IDL order).
const INIT_POOL_ACCOUNTS: Record<string, { config: number; baseMint: number; quoteMint: number; pool: number; payer: number }> = {
  [IX.INIT_POOL_SPL]: { config: 0, baseMint: 3, quoteMint: 4, pool: 5, payer: 10 },
  [IX.INIT_POOL_2022]: { config: 0, baseMint: 3, quoteMint: 4, pool: 5, payer: 8 },
  [IX.INIT_POOL_2022_HOOK]: { config: 0, baseMint: 3, quoteMint: 4, pool: 5, payer: 9 },
}
const SWAP_REFERRAL_ACCOUNT: Record<string, number> = { [DBC_PROGRAM]: 12, [DAMM_V2_PROGRAM]: 11 }

// --- Reading the chain --------------------------------------------------------------------------------------

type Signature = { signature: string; blockTime: number }

const histories = new Map<string, Promise<Signature[]>>()

// Every successful signature of an address from now back to `floor`, newest first, read once per run. The
// addresses are Ryntra's own accounts and pools, so the walk is short; a refill of many days reads it once.
function history(address: string, floor: number): Promise<Signature[]> {
  const key = `${address}:${floor}`
  if (!histories.has(key)) histories.set(key, (async () => {
    const found: Signature[] = []
    let before: string | undefined
    while (true) {
      const page = await getSignaturesForAddress({ address, limit: 1000, before })
      if (!page?.length) break
      for (const entry of page) if (!entry.err && typeof entry.blockTime === 'number' && entry.blockTime >= floor) found.push({ signature: entry.signature, blockTime: entry.blockTime })
      // A signature not timestamped yet says nothing about the window; keep paging past it.
      const oldest = [...page].reverse().find((entry: any) => typeof entry.blockTime === 'number')
      if (page.length < 1000 || (oldest && oldest.blockTime! < floor)) break
      before = page[page.length - 1].signature
    }
    return found
  })())
  return histories.get(key)!
}

export async function signaturesIn(addresses: string[], from: number, to: number, floor: number): Promise<string[]> {
  const seen = new Set<string>()
  for (const address of addresses)
    for (const entry of await history(address, Math.min(floor, from)))
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
  if (!transactions.has(signature)) transactions.set(signature, (async () => {
    const tx = await getTransaction({ signature, encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 })
    // No transaction or no metadata means the node could not serve it, not that nothing happened.
    if (!tx?.meta || !tx.transaction?.message) throw new Error(`ryntra: solana rpc returned no transaction for ${signature}`)
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
  })())
  return transactions.get(signature)!
}

const hex = (data: Buffer, start: number, end: number) => data.subarray(start, end).toString('hex')
const u64 = (data: Buffer, offset: number) => data.readBigUInt64LE(offset)
const key = (data: Buffer, offset: number) => base58Encode(data.subarray(offset, offset + 32))

// Net movement per mint of the token accounts of one owner (or of the given accounts only).
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
  config: string | null // DBC only
  buy: boolean // quote in, base out
  quoteVolume: bigint // the quote side of the swap, fee included
  tradingFee: bigint // DBC: the config's trading fee (creator and partner); DAMM v2: the liquidity's fee
  protocolFee: bigint
  referralFee: bigint
  referralAccount: string | null // the referral token account the swap instruction named
}

// Every Meteora swap in a transaction with its event: the event a program emits is the next self-invocation
// after the swap instruction that caused it.
export function launchSwaps(tx: Tx): LaunchSwap[] {
  const swaps: LaunchSwap[] = []
  for (const flow of tx.flows) {
    const pending: { program: string; referral: string | null }[] = []
    for (const ix of flow) {
      const isMeteora = ix.programId === DBC_PROGRAM || ix.programId === DAMM_V2_PROGRAM
      if (!isMeteora || ix.data.length < 16) continue
      const head = hex(ix.data, 0, 8)
      if (head === IX.SWAP || head === IX.SWAP2) {
        pending.push({ program: ix.programId, referral: ix.accounts[SWAP_REFERRAL_ACCOUNT[ix.programId]] ?? null })
        continue
      }
      if (head !== EVENT_TAG) continue
      const event = hex(ix.data, 8, 16)
      const at = pending.findIndex((swap) => swap.program === ix.programId)
      if (at < 0) continue
      const d = ix.data
      let swap: LaunchSwap | null = null
      // Offsets: 8 bytes of tag, 8 of event discriminator, then the fields in IDL order.
      if (ix.programId === DBC_PROGRAM && event === EVENT.DBC_SWAP) {
        // EvtSwap: pool, config, trade_direction, has_referral, {amount_in, minimum_amount_out},
        // {actual_input_amount, output_amount, next_sqrt_price u128, trading_fee, protocol_fee, referral_fee}, amount_in, current_timestamp
        const buy = d[80] === 1
        swap = { program: DBC_PROGRAM, pool: key(d, 16), config: key(d, 48), buy, quoteVolume: buy ? u64(d, 154) : u64(d, 106), tradingFee: u64(d, 130), protocolFee: u64(d, 138), referralFee: u64(d, 146), referralAccount: null }
      } else if (ix.programId === DBC_PROGRAM && event === EVENT.SWAP2) {
        // EvtSwap2: pool, config, trade_direction, has_referral, {amount_0, amount_1, swap_mode u8},
        // {included_fee_input_amount, excluded_fee_input_amount, amount_left, output_amount, next_sqrt_price u128, trading_fee, protocol_fee, referral_fee}, ...
        const buy = d[80] === 1
        swap = { program: DBC_PROGRAM, pool: key(d, 16), config: key(d, 48), buy, quoteVolume: buy ? u64(d, 99) : u64(d, 123), tradingFee: u64(d, 147), protocolFee: u64(d, 155), referralFee: u64(d, 163), referralAccount: null }
      } else if (ix.programId === DAMM_V2_PROGRAM && event === EVENT.SWAP2) {
        // EvtSwap2: pool, trade_direction, collect_fee_mode, has_referral, {amount_0, amount_1, swap_mode u8},
        // {included_fee_input_amount, excluded_fee_input_amount, amount_left, output_amount, next_sqrt_price u128, claiming_fee, protocol_fee, compounding_fee, referral_fee}, ...
        const buy = d[48] === 1 // B (the quote) to A
        swap = { program: DAMM_V2_PROGRAM, pool: key(d, 16), config: null, buy, quoteVolume: buy ? u64(d, 68) : u64(d, 92), tradingFee: u64(d, 116) + u64(d, 132), protocolFee: u64(d, 124), referralFee: u64(d, 140), referralAccount: null }
      }
      if (!swap) continue
      swap.referralAccount = pending[at].referral
      pending.splice(at, 1)
      swaps.push(swap)
    }
  }
  return swaps
}

// --- Trades made through Ryntra -----------------------------------------------------------------------------

export type Credit = { identity: 'jupiter-referral' | 'fee-wallet' | 'launch-referral'; mint: string; amount: bigint }
export type RyntraTrade = {
  signature: string
  blockTime: number
  taker: string
  credits: Credit[]
  legs: Map<string, bigint> // the taker's own token movements, per mint
  takerLamports: bigint
  onLaunchCurve: boolean // a trade on a Ryntra Launch bonding curve: its volume is Ryntra Launch's
}

const isFeeAccount = (entry: TokenBalance) => entry.account in FEE_WALLET_ACCOUNTS
const isReferralAccount = (entry: TokenBalance) => entry.account in JUPITER_REFERRAL_ACCOUNTS
const OWN = new Set([JUPITER_REFERRAL, FEE_WALLET, LAUNCH_FEE_CLAIMER, LAUNCH_POOL_PAYER])
// The rent a closed token account returns, at most (a Token-2022 account with extensions holds more).
const RENT_CEILING = 3_000_000n

// Ryntra's attribution rule (version 1.2.0, the rule ryntra.io/stats counts by): a transaction is a trade through
// Ryntra when it credited one of Ryntra's fee accounts and the signer traded. A plain transfer into a fee account
// is a deposit. Through the fee wallet alone the signer must have received something or paid in another mint,
// and the fee must be at least one basis point of the signer's own movement in that asset, so dust sent beside
// somebody else's swap never makes it Ryntra's. Through Meteora, the trade's swap names Ryntra's referral account
// and its event states the referral fee.
export function ryntraTrade(tx: Tx): RyntraTrade | null {
  const credits: Credit[] = []
  for (const [mint, amount] of deltas(tx, isReferralAccount)) if (amount > 0n) credits.push({ identity: 'jupiter-referral', mint, amount })
  for (const [mint, amount] of deltas(tx, isFeeAccount)) if (amount > 0n) credits.push({ identity: 'fee-wallet', mint, amount })
  const swaps = launchSwaps(tx)
  const launchReferral = swaps.filter((swap) => swap.referralAccount === LAUNCH_REFERRAL_ACCOUNT && swap.referralFee > 0n)
  const launchFee = launchReferral.reduce((sum, swap) => sum + swap.referralFee, 0n)
  if (launchFee > 0n) credits.push({ identity: 'launch-referral', mint: USDC, amount: launchFee })
  if (!credits.length) return null

  // The taker: the first signer, Ryntra's own accounts aside, whose tokens moved; else the fee payer.
  const signers = tx.signers.filter((signer) => !OWN.has(signer))
  if (!signers.length) return null
  let taker = signers[0]
  let legs = new Map<string, bigint>()
  for (const signer of signers) {
    const moved = deltas(tx, (entry) => entry.owner === signer)
    if (moved.size) { taker = signer; legs = moved; break }
  }
  const takerLamports = tx.lamports.get(taker) ?? 0n

  // A deposit: every movement of the signer is a debit equal to a credit of a fee account in the same mint.
  const credited = (mint: string) => credits.filter((credit) => credit.mint === mint).reduce((sum, credit) => sum + credit.amount, 0n)
  const bare = legs.size > 0 && [...legs].every(([mint, amount]) => amount < 0n && credited(mint) === -amount)
  if (bare) return null

  const viaFeeWalletOnly = credits.every((credit) => credit.identity === 'fee-wallet')
  if (viaFeeWalletOnly) {
    const owned = (entries: TokenBalance[]) => new Set(entries.filter((entry) => entry.owner === taker).map((entry) => entry.account))
    const after = owned(tx.post)
    const closed = [...owned(tx.pre)].filter((account) => !after.has(account)).length
    const received = [...legs.values()].some((amount) => amount > 0n) || takerLamports > BigInt(closed) * RENT_CEILING
    const creditedMints = new Set(credits.map((credit) => credit.mint))
    const traded = received || [...legs].some(([mint, amount]) => amount < 0n && !creditedMints.has(mint))
    if (!traded) return null
    const abs = (value: bigint) => (value < 0n ? -value : value)
    const sized = credits.every((credit) => {
      let reference = abs(legs.get(credit.mint) ?? 0n)
      if (credit.mint === SOL) reference += abs(takerLamports)
      return reference > 0n && credit.amount * 10_000n >= reference
    })
    if (!sized) return null
  }
  const onLaunchCurve = launchReferral.some((swap) => swap.program === DBC_PROGRAM)
  return { signature: tx.signature, blockTime: tx.blockTime, taker, credits, legs, takerLamports, onLaunchCurve }
}

// The trade's size, one side of it, in a token DefiLlama can price: the person's stablecoin leg (what they paid,
// else what they received); when the other side of a single token is SOL, the SOL they paid or received; between
// two other tokens, what they paid. SOL is read as the whole change of the person's wallet and of their token
// accounts, so SOL wrapped and closed inside the swap counts, and the rent of an account the trade opens or closes
// and the network fee do not.
export function tradeSize(trade: RyntraTrade, tx: Tx): { mint: string; amount: bigint } | null {
  const abs = (value: bigint) => (value < 0n ? -value : value)
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

// Every trade through Ryntra in a window. The fee accounts are read back to the first fee, and only
// transactions inside the window are fetched.
export const TRADING_START = Date.UTC(2026, 8, 10) / 1000 // the referral account's first fee, 2026-09-10 08:00 UTC
export const LAUNCH_START = Date.UTC(2026, 9, 6) / 1000 // Ryntra Launch opened to people on 2026-10-06

export async function ryntraTrades(from: number, to: number): Promise<{ trade: RyntraTrade; tx: Tx }[]> {
  const signatures = await signaturesIn([...Object.keys(JUPITER_REFERRAL_ACCOUNTS), ...Object.keys(FEE_WALLET_ACCOUNTS)], from, to, TRADING_START)
  if (to > LAUNCH_START) for (const signature of await signaturesIn([LAUNCH_REFERRAL_ACCOUNT], Math.max(from, LAUNCH_START), to, LAUNCH_START)) if (!signatures.includes(signature)) signatures.push(signature)
  const found: { trade: RyntraTrade; tx: Tx }[] = []
  for (const signature of signatures) {
    const tx = await readTx(signature)
    const trade = ryntraTrade(tx)
    if (trade) found.push({ trade, tx })
  }
  return found
}

// --- Tokens launched through Ryntra -------------------------------------------------------------------------

// Every pool Ryntra Launch created before `to`: a Meteora DBC pool initialised on one of Launch's configs and paid
// for by Launch's pool payer, with the token it launched.
export async function launchPools(to: number): Promise<{ pool: string; mint: string }[]> {
  const pools = new Map<string, string>()
  for (const signature of await signaturesIn([LAUNCH_POOL_PAYER], LAUNCH_START, to, LAUNCH_START)) {
    const tx = await readTx(signature)
    for (const flow of tx.flows) for (const ix of flow) {
      if (ix.programId !== DBC_PROGRAM || ix.data.length < 8) continue
      const layout = INIT_POOL_ACCOUNTS[hex(ix.data, 0, 8)]
      if (!layout) continue
      if (LAUNCH_CONFIGS.includes(ix.accounts[layout.config]) && ix.accounts[layout.payer] === LAUNCH_POOL_PAYER && ix.accounts[layout.quoteMint] === USDC) pools.set(ix.accounts[layout.pool], ix.accounts[layout.baseMint])
    }
  }
  return [...pools].map(([pool, mint]) => ({ pool, mint }))
}

// The swaps on the bonding curves of Ryntra's launches in a window, one per event.
export async function launchCurveSwaps(from: number, to: number): Promise<LaunchSwap[]> {
  const pools = (await launchPools(to)).map((launch) => launch.pool)
  const swaps: LaunchSwap[] = []
  for (const signature of await signaturesIn(pools, from, to, LAUNCH_START)) {
    const tx = await readTx(signature)
    for (const swap of launchSwaps(tx)) if (swap.program === DBC_PROGRAM && pools.includes(swap.pool) && LAUNCH_CONFIGS.includes(swap.config!)) swaps.push(swap)
  }
  return swaps
}

// After a curve graduates, its liquidity moves to a Meteora DAMM v2 pool and half of it stays locked for Ryntra
// as the partner (partner_permanent_locked_liquidity_percentage 50). The fees of that position reach Ryntra when
// the fee claimer claims them: DAMM v2 claim_position_fee, signed through the claimer, on a pool of a launched
// token against USDC, and the EvtClaimPositionFee it emits with the claimer as the owner.
export async function graduatedPositionClaims(from: number, to: number): Promise<{ mint: string; amount: bigint }[]> {
  const launched = new Set((await launchPools(to)).map((launch) => launch.mint))
  const claims: { mint: string; amount: bigint }[] = []
  for (const signature of await signaturesIn([LAUNCH_FEE_CLAIMER], Math.max(from, LAUNCH_START), to, LAUNCH_START)) {
    const tx = await readTx(signature)
    for (const flow of tx.flows) {
      let mints: [string, string] | null = null
      for (const ix of flow) {
        if (ix.programId !== DAMM_V2_PROGRAM || ix.data.length < 8) continue
        const head = hex(ix.data, 0, 8)
        // claim_position_fee: token_a_mint 7, token_b_mint 8 (IDL order)
        if (head === IX.CLAIM_POSITION_FEE) { mints = launched.has(ix.accounts[7]) && ix.accounts[8] === USDC ? [ix.accounts[7], ix.accounts[8]] : null; continue }
        if (!mints || head !== EVENT_TAG || ix.data.length < 128 || hex(ix.data, 8, 16) !== EVENT.DAMM_CLAIM_POSITION_FEE) continue
        // EvtClaimPositionFee: pool, position, owner, fee_a_claimed, fee_b_claimed
        if (key(ix.data, 80) === LAUNCH_FEE_CLAIMER) {
          claims.push({ mint: mints[0], amount: u64(ix.data, 112) }, { mint: mints[1], amount: u64(ix.data, 120) })
        }
        mints = null
      }
    }
  }
  return claims.filter((claim) => claim.amount > 0n)
}
