import { FetchOptions, FetchResultV2, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'
import { METRIC } from '../../helpers/metrics'
import { getEnv } from '../../helpers/env'
import { fetchURLAutoHandleRateLimit } from '../../utils/fetchURL'
import { sleep } from '../../utils/utils'

// Every treasury Hipo has run. v1 served from launch until v2 replaced it on 2024-03-19; both are
// queried for every window rather than switched on a hardcoded date, so the cutover needs no
// maintenance and a window spanning it is counted once from each.
const TREASURIES = [
    'EQBNo5qAG8I8J6IxGaz15SfQVB-kX98YhKV_mT36Xo5vYxUa',
    'EQCLyZHP4Xe8fpchQz76O-_RmUhaVc_9BAoGyJrwJrcbz2eZ',
]

// The same two, raw, for comparing against the sender inside a burner log. Addresses arrive there
// as 267 raw bits, and decoding those back to the friendly form would mean carrying a base64
// address codec for one comparison.
const TREASURIES_RAW = [
    '0:4da39a801bc23c27a23119acf5e527d0541fa45fdf1884a57f993dfa5e8e6f63',
    '0:8bc991cfe177bc7e9721433efa3befd199485a55cffd040a06c89af026b71bcf',
]

// Every burn contract Hipo has run. The first served from 2026-09-05 until the second replaced it
// on 2026-09-09; it had no set_code, so a fix could only be delivered by redeploying. The
// replacement is upgradable, so this list should not need a third entry -- but it is a list for
// the same reason TREASURIES is: queried for every window rather than switched on a hardcoded
// date, so a window spanning the cutover is counted once from each and the change needs no
// maintenance.
//
// GRAM sent here is staked into Hipo, spent buying HPO on the DeDust hGRAM/HPO pool, and burned.
// Two things pay it: the treasury forwards the borrower fee, and Hipo's HPO trading bot sweeps its
// realized profit. Reading the burner rather than the treasury is what makes the second one
// visible -- it never touches the treasury, so a treasury-only reading misses it entirely.
const BURNERS = [
    'EQAGPJMxJ73OLpHUgQhI5YeQe2ZuAuUQ-4f_zfN4rV2Fl6Jp',
    'EQDcjZDWvotoVE0X4HSdt2pR3b2sBZ4XikzSVSdPiqdQMLRK',
]

// Toncenter allows one request per second unauthenticated, and under that limit this endpoint
// answers with HTTP 500 "timeout: context deadline exceeded" often enough to matter -- five of six
// back-to-back requests, in a burst measured while writing this. Those are errors rather than empty
// results, so fetchURLAutoHandleRateLimit's backoff turns them into a retry rather than into a day
// reported as zero. The key is here to make a long refill finish, not to keep it correct.
// DefiLlama's TVL repo already reads this same variable in projects/helper/chain/ton.js.
// The key goes in a header rather than the query string: formAxiosError attaches the request URL
// to every error it raises, and those errors are logged, so a key in the URL is a key in the logs.
//
// maxRedirects is then required rather than optional. Axios strips Authorization when a redirect
// crosses hosts but leaves custom headers alone, so a redirect off toncenter would carry the key
// with it. Toncenter does not redirect, so refusing to follow one costs nothing and the request
// fails loudly if that ever changes. The timeout is here for the same reason the retries are:
// axios defaults to none, and a stalled connection would hang the day's pagination forever.
// Measured response time for these calls is 0.2 to 0.6 seconds.
const apiKey = getEnv('TONCENTER_API_KEY')
const requestOptions = {
    timeout: 30000,
    maxRedirects: 0,
    ...(apiKey ? { headers: { 'X-API-Key': apiKey } } : {}),
}
const PAGE = 256
// Above fetchURLAutoHandleRateLimit's default of 3, which spends its attempts over ten seconds.
const RETRIES = 5

// Without a key, keep to toncenter's documented one request per second rather than spending
// retries on self-inflicted throttling. A single day is one page per treasury, so this costs about
// a second per run; over a full refill it is what keeps an unauthenticated run from tripping over
// itself. With a key it does nothing.
let lastRequestAt = 0
async function pacedGet(url: string) {
    if (!apiKey) {
        const wait = lastRequestAt + 1100 - Date.now()
        if (wait > 0) await sleep(wait)
    }
    lastRequestAt = Date.now()
    return fetchURLAutoHandleRateLimit(url, RETRIES, requestOptions)
}

// The treasury reports every loan repayment as a log: an external-out message whose body carries
// the round's reward already split into its destinations. Reading the split from the log is what
// makes this adapter exact and backfillable -- the amounts are per event and carry the block time,
// so a window needs no rate, no round length and no normalisation.
//
// The alternative, reading the exchange rate out of get_treasury_state and annualising it, can only
// ever describe the present: get methods run against the latest state, so every past day would have
// to reuse today's rate. That is what this adapter did until now, and the normalisation it needed
// is what made it report roughly double the truth for most of 2024 and 2025.
//
// Topics live in the message's external destination address, which the toncenter API does not
// return, so a log is identified by its shape instead. That is not as weak as it sounds: a body
// must consume to exactly zero bits and end on a well-formed addr_std, and the amounts must satisfy
// the accounting the treasury guarantees. The layout has three historical versions, tried newest
// first.
//
// The burn is deliberately absent. The repayment log does carry it -- it is the seventh Coins in
// the current layout, and the parses below still consume it -- but it says what the treasury
// forwarded, not what reached the burn. Counting it here as well as at the burner would count the
// borrower fee twice, and the burner is the better of the two readings: it is where the trading
// bot's profit also arrives, and its figure is what actually became HPO.
type Repayment = { stakers: bigint; governor: bigint }

const parseBoc = (b64: string): { data: Buffer; bits: number } | null => {
    const raw = Buffer.from(b64, 'base64')
    if (raw.length < 6 || raw.readUInt32BE(0) !== 0xb5ee9c72) return null
    const flags = raw[4]
    const refSize = flags & 7
    const offSize = raw[5]
    let p = 6
    const readN = (n: number) => {
        let v = 0
        for (let i = 0; i < n; i++) v = v * 256 + raw[p++]
        return v
    }
    const cellCount = readN(refSize)
    const rootCount = readN(refSize)
    readN(refSize) // absent
    readN(offSize) // total size
    if (rootCount !== 1) return null
    const rootIdx = readN(refSize)
    if (flags & 0x80) p += cellCount * offSize // index
    if (rootIdx !== 0) return null // roots always come first in the bodies we read

    const d1 = raw[p++]
    const d2 = raw[p++]
    if (d1 & 8) return null // exotic
    const refs = d1 & 7
    if (refs !== 0) return null // log bodies are a single cell; a ref means an unknown layout
    const len = (d2 >> 1) + (d2 & 1)
    const data = raw.subarray(p, p + len)
    if (data.length !== len) return null
    let bits = len * 8
    if (d2 & 1) {
        // the final byte is padded with a 1 marking the last real bit, then zeros
        const last = data[len - 1]
        let trailing = 0
        while (trailing < 8 && ((last >> trailing) & 1) === 0) trailing++
        bits = len * 8 - 1 - trailing
    }
    return { data, bits }
}

class Reader {
    private pos = 0
    constructor(private data: Buffer, public readonly bits: number) { }
    left(): number { return this.bits - this.pos }
    uint(n: number): number {
        if (this.pos + n > this.bits) throw new Error('short read')
        let v = 0
        for (let i = 0; i < n; i++) {
            const bit = this.pos + i
            v = v * 2 + ((this.data[bit >> 3] >> (7 - (bit & 7))) & 1)
        }
        this.pos += n
        return v
    }
    big(n: number): bigint {
        if (this.pos + n > this.bits) throw new Error('short read')
        let v = 0n
        for (let i = 0; i < n; i++) {
            const bit = this.pos + i
            v = (v << 1n) | BigInt((this.data[bit >> 3] >> (7 - (bit & 7))) & 1)
        }
        this.pos += n
        return v
    }
    coins(): bigint {
        const len = this.uint(4)
        return len === 0 ? 0n : this.big(len * 8)
    }
    addrStd(): boolean {
        if (this.left() !== 267) return false
        if (this.uint(2) !== 2) return false // addr_std$10
        if (this.uint(1) !== 0) return false // no anycast
        this.uint(8)
        this.big(256)
        return this.left() === 0
    }
    // The same check, keeping the address. Burner logs carry the payer, and which payer it was is
    // the difference between a fee a validator was charged and the trading bot's own profit.
    addrStdRaw(): string | null {
        if (this.left() !== 267) return null
        if (this.uint(2) !== 2) return null // addr_std$10
        if (this.uint(1) !== 0) return null // no anycast
        const wc = this.uint(8)
        const hash = this.big(256)
        if (this.left() !== 0) return null
        // uint(8) reads unsigned; workchain is int8, and -1 is the masterchain.
        const chain = wc > 127 ? wc - 256 : wc
        return `${chain}:${hash.toString(16).padStart(64, '0')}`
    }
}

// Every share is carved out of what came back from the elector, so their sum cannot exceed the
// repayment. That one bound is what separates a repayment from another log whose body happens to
// fit the same bit layout: three such bodies appear in 2025 alone, and they read as an 80 GRAM
// repayment paying a 50,405 GRAM governance fee.
//
// It is deliberately the only check. An earlier version also required loan + accrue <= repayment,
// which rejects nothing the bound above does not already catch, and which stops being true in the
// one case that matters: when a validator defaults the elector returns less than was lent, and the
// treasury books the gap as deficit. Dropping a repayment there would silently understate the day.
const sharesFitRepayment = (v: bigint[]) =>
    v.slice(3).reduce((a, b) => a + b, 0n) <= v[0]

const readCoinsThenAddress = (b64: string, n: number): bigint[] | null => {
    const cell = parseBoc(b64)
    if (!cell) return null
    try {
        const r = new Reader(cell.data, cell.bits)
        r.uint(32) // round_since
        const v: bigint[] = []
        for (let i = 0; i < n; i++) v.push(r.coins())
        return r.addrStd() && sharesFitRepayment(v) ? v : null
    } catch { return null }
}

const readAddressThenCoins = (b64: string, n: number): bigint[] | null => {
    const cell = parseBoc(b64)
    if (!cell) return null
    try {
        const r = new Reader(cell.data, cell.bits)
        r.uint(32) // round_since
        if (r.uint(2) !== 2 || r.uint(1) !== 0) return null
        r.uint(8)
        r.big(256)
        const v: bigint[] = []
        for (let i = 0; i < n; i++) v.push(r.coins())
        return r.left() === 0 && sharesFitRepayment(v) ? v : null
    } catch { return null }
}

const readRepayment = (b64: string): Repayment | null => {
    // current: round_since, repayment, loan, accrue, stakers, governor, borrower, burn, borrower_addr
    let v = readCoinsThenAddress(b64, 7)
    if (v) return { stakers: v[3], governor: v[4] }
    // 2024-03-19 to 2026-09-05: the same without burn, which did not exist yet
    v = readCoinsThenAddress(b64, 6)
    if (v) return { stakers: v[3], governor: v[4] }
    // v1 treasury: the borrower's address came first, before the amounts
    v = readAddressThenCoins(b64, 6)
    if (v) return { stakers: v[3], governor: v[4] }
    return null
}

// The burner emits one log per payment it accepts, carrying the op, the amount, the running total
// and the payer:
//
//   log::received  op:uint32  msg_value:Coins  total_received:Coins  src:MsgAddr
//
// It is emitted after the contract's own route guard, so returned change -- discovery replies,
// unspent swap forwards, DeDust refunds, the burn's excesses -- is already excluded and every
// entry is income counted exactly once. That guard is the reason to read the log rather than the
// burner's incoming messages: reproducing it off-chain would mean maintaining a second copy of a
// rule the contract already applies, and getting it wrong means counting the contract's own money
// coming back as revenue.
//
// Shape alone identifies it, as with the repayment logs above, because the topic lives in the
// message's external destination address and the API does not return it. The burner emits five
// other logs, and they were checked one at a time rather than as a group:
//
//   discovery and deposit are far too short to hold an address at all.
//   swap and burn can only fit this layout with both Coins zero-length, which the value > 0 test
//     below already rejects.
//   upgrade is query_id:uint64 + src:MsgAddr, and it genuinely can parse as a receipt -- it ends
//     on a real addr_std, so nothing structural separates the two. It is excluded by length: at
//     331 bits the two Coins have three bytes between them, so a receipt read out of one would
//     carry a cumulative total under 0.017 GRAM. A burner holds a 1 GRAM gas reserve, so it is
//     funded with at least that before it can accept anything, and every receipt after the first
//     is above the threshold by orders of magnitude. The first is excluded anyway, below.
const UPGRADE_LOG_BITS = 331
type Receipt = { value: bigint; total: bigint; src: string }

const readReceived = (b64: string): Receipt | null => {
    const cell = parseBoc(b64)
    if (!cell) return null
    if (cell.bits === UPGRADE_LOG_BITS) return null
    try {
        const r = new Reader(cell.data, cell.bits)
        r.uint(32) // op, whatever the payer happened to send
        const value = r.coins()
        const total = r.coins()
        const src = r.addrStdRaw()
        if (src === null) return null
        // total_received is cumulative and includes this payment, so this holds for every real
        // entry and is what rejects another log whose bits happen to fit the layout.
        if (value <= 0n || value > total) return null
        // A burner has to be funded before anything can pay it, so its first income is always the
        // deployment that created it -- 2 GRAM, most of which stays behind as the gas reserve
        // rather than being burned. That is the protocol seeding a contract, not revenue it
        // earned, and the cumulative total identifies it without needing to know who deployed it:
        // this is the only payment for which the running total is the payment itself.
        if (value === total) return null
        return { value, total, src }
    } catch { return null }
}

// Both the treasury and the burn contracts are read the same way: page their external-out
// messages over the window and keep the ones that parse as the log we are after.
async function logs<T>(
    source: string,
    start: number,
    end: number,
    parse: (body: string) => T | null,
): Promise<T[]> {
    const found: T[] = []
    for (let offset = 0; ; offset += PAGE) {
        const url =
            `https://toncenter.com/api/v3/messages?source=${source}&direction=out` +
            `&start_utime=${start}&end_utime=${end}&limit=${PAGE}&offset=${offset}&sort=desc`
        const data = await pacedGet(url)
        // A body without a messages array is a failure wearing a 200. Reading it as an empty page
        // would store the day as zero, which is the one outcome worth crashing to avoid.
        if (!Array.isArray(data?.messages)) {
            throw new Error('Expected a messages array from toncenter for ' + source)
        }
        const messages: any[] = data.messages
        for (const message of messages) {
            // logs are external-out, which the API reports with no destination
            if (message.destination !== null && message.destination !== undefined) continue
            const body = message.message_content?.body
            if (!body) continue
            const parsed = parse(body)
            if (parsed !== null) found.push(parsed)
        }
        if (messages.length < PAGE) break
    }
    return found
}

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
    // Sequential on purpose. Unauthenticated toncenter allows one request per second, and two
    // streams racing it just means both spend their retries backing off each other.
    const found: Repayment[] = []
    for (const treasury of TREASURIES) {
        found.push(...(await logs(treasury, options.startTimestamp, options.endTimestamp, readRepayment)))
    }

    // The burn side comes from the burner itself, so that the trading bot's profit -- which never
    // touches the treasury -- is counted alongside the borrower fee.
    const income: Receipt[] = []
    for (const burner of BURNERS) {
        income.push(...(await logs(burner, options.startTimestamp, options.endTimestamp, readReceived)))
    }

    let stakers = 0n
    let governor = 0n
    for (const r of found) {
        stakers += r.stakers
        governor += r.governor
    }

    // Split by who paid. Only the treasury's share is a fee somebody was charged; the rest is the
    // protocol spending its own money on the buy-back, and calling that a user fee would invent a
    // user who paid it.
    let borrowerFee = 0n
    let otherBuyBack = 0n
    for (const r of income) {
        if (TREASURIES_RAW.includes(r.src)) borrowerFee += r.value
        else otherBuyBack += r.value
    }
    const burn = borrowerFee + otherBuyBack

    const dailyFees = options.createBalances()
    const dailyUserFees = options.createBalances()
    const dailySupplySideRevenue = options.createBalances()
    const dailyProtocolRevenue = options.createBalances()
    const dailyHoldersRevenue = options.createBalances()
    const dailyRevenue = options.createBalances()

    // The validators' own share is already deducted before the treasury books any of this, so the
    // pool's reward and the governance fee taken out of it are the whole of the staking-side fee.
    dailyFees.addGasToken(stakers, METRIC.STAKING_REWARDS)
    dailyFees.addGasToken(governor, METRIC.STAKING_REWARDS)
    dailySupplySideRevenue.addGasToken(stakers, METRIC.STAKING_REWARDS)
    dailyProtocolRevenue.addGasToken(governor, METRIC.STAKING_REWARDS)
    dailyRevenue.addGasToken(governor, METRIC.STAKING_REWARDS)

    // GRAM that reached the burn contract, which stakes it, buys HPO with the resulting hGRAM on
    // DeDust and burns it. HPO is a Notcoin-fork jetton, so the burn lowers total supply rather
    // than moving tokens to a dead address.
    //
    // Two things pay it. The borrower fee is charged on top of what the pool receives, out of the
    // borrower's own funds, so it never reduces the staker reward or moves the exchange rate --
    // additional gross income, and a fee a validator actually paid. The rest is the HPO trading
    // bot's realized profit, swept to the same contract; it reaches holders the same way but
    // nobody was charged for it, so it is not a user fee.
    //
    // Both are revenue on the holders' side, which is the whole point of reading the burner: it is
    // the one place the two meet.
    dailyFees.addGasToken(burn, METRIC.TOKEN_BUY_BACK)
    dailyUserFees.addGasToken(borrowerFee, METRIC.TOKEN_BUY_BACK)
    dailyHoldersRevenue.addGasToken(burn, METRIC.TOKEN_BUY_BACK)
    dailyRevenue.addGasToken(burn, METRIC.TOKEN_BUY_BACK)

    return {
        dailyFees,
        dailyUserFees,
        dailySupplySideRevenue,
        dailyProtocolRevenue,
        dailyHoldersRevenue,
        dailyRevenue,
    }
}

const methodology = {
    Fees: 'Validation rewards credited to the pool, summed from the treasury\'s repayment logs for the day, plus the GRAM that reached Hipo\'s buy-and-burn contract and was spent on HPO. The validators\' own share of a round\'s reward is deducted before the pool is credited, so it is not counted here.',
    UserFees: 'Stakers pay no fees for using Hipo. The borrowers the pool lends to, who are validators, pay a fee out of their own share of each round\'s reward.',
    SupplySideRevenue: 'Rewards credited to stakers, which reach them as a rise in the hGRAM exchange rate rather than as a separate claim.',
    ProtocolRevenue: 'The governance fee, deducted from the pool\'s reward before it reaches stakers. Its rate is set by Hipo\'s governor and can be zero.',
    HoldersRevenue: 'GRAM sent to Hipo\'s buy-and-burn contract, read from that contract\'s own income log so that returned change is excluded. It stakes the GRAM, buys HPO with the resulting hGRAM on DeDust, and burns it, lowering the total supply of HPO. Two sources pay it: the borrower fee forwarded by the treasury, and the realized profit of Hipo\'s HPO trading bot.',
    Revenue: 'The governance fee, plus everything spent buying and burning HPO.',
}

const breakdownMethodology = {
    Fees: {
        [METRIC.STAKING_REWARDS]: 'Validation rewards credited to the pool, net of the validators\' share.',
        [METRIC.TOKEN_BUY_BACK]: 'GRAM spent buying and burning HPO: the borrower fee, taken from each borrower\'s contractual share of a round\'s reward, plus the trading bot\'s realized profit.',
    },
    UserFees: {
        [METRIC.TOKEN_BUY_BACK]: 'The borrower fee, paid by validators out of their own share of a round\'s reward. The trading bot\'s profit is excluded here: it reaches holders the same way, but nobody was charged for it.',
    },
    SupplySideRevenue: {
        [METRIC.STAKING_REWARDS]: 'Rewards to stakers, delivered as a rise in the hGRAM exchange rate.',
    },
    ProtocolRevenue: {
        [METRIC.STAKING_REWARDS]: 'The governance fee, deducted from the pool\'s reward.',
    },
    HoldersRevenue: {
        [METRIC.TOKEN_BUY_BACK]: 'GRAM that reached the burner and was spent buying HPO, which is then burned.',
    },
    Revenue: {
        [METRIC.STAKING_REWARDS]: 'The governance fee.',
        [METRIC.TOKEN_BUY_BACK]: 'The borrower fee and the trading bot\'s profit, both burned as HPO.',
    },
}

const adapter: SimpleAdapter = {
    version: 2,
    adapter: {
        [CHAIN.TON]: {
            start: '2023-10-30',
            fetch,
        },
    },
    methodology,
    breakdownMethodology,
}

export default adapter
