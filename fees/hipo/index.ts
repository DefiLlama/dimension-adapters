import { FetchOptions, FetchResultV2, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'
import { METRIC } from '../../helpers/metrics'
import { getEnv } from '../../helpers/env'
import { fetchURLAutoHandleRateLimit } from '../../utils/fetchURL'

// Every treasury Hipo has run. v1 served from launch until v2 replaced it on 2024-03-19; both are
// queried for every window rather than switched on a hardcoded date, so the cutover needs no
// maintenance and a window spanning it is counted once from each.
const TREASURIES = [
    'EQBNo5qAG8I8J6IxGaz15SfQVB-kX98YhKV_mT36Xo5vYxUa',
    'EQCLyZHP4Xe8fpchQz76O-_RmUhaVc_9BAoGyJrwJrcbz2eZ',
]

// Toncenter allows one request per second unauthenticated, and under that limit this endpoint
// answers with HTTP 500 "timeout: context deadline exceeded" often enough to matter -- five of six
// back-to-back requests, in a burst measured while writing this. Those are errors rather than empty
// results, so fetchURLAutoHandleRateLimit's backoff turns them into a retry rather than into a day
// reported as zero. The key is here to make a long refill finish, not to keep it correct.
// DefiLlama's TVL repo already reads this same variable in projects/helper/chain/ton.js.
// Sent as a header rather than in the query string: formAxiosError attaches the request URL to
// every error it raises, and those errors are logged, so a key in the URL is a key in the logs.
const apiKey = getEnv('TONCENTER_API_KEY')
const headers = apiKey ? { headers: { 'X-API-Key': apiKey } } : undefined
const PAGE = 256
// Above fetchURLAutoHandleRateLimit's default of 3, which spends its attempts over ten seconds.
const RETRIES = 5

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
type Repayment = { stakers: bigint; governor: bigint; burn: bigint }

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
    if (v) return { stakers: v[3], governor: v[4], burn: v[6] }
    // 2024-03-19 to 2026-09-05: the same without burn, which did not exist yet
    v = readCoinsThenAddress(b64, 6)
    if (v) return { stakers: v[3], governor: v[4], burn: 0n }
    // v1 treasury: the borrower's address came first, before the amounts
    v = readAddressThenCoins(b64, 6)
    if (v) return { stakers: v[3], governor: v[4], burn: 0n }
    return null
}

async function repayments(treasury: string, start: number, end: number): Promise<Repayment[]> {
    const found: Repayment[] = []
    for (let offset = 0; ; offset += PAGE) {
        const url =
            `https://toncenter.com/api/v3/messages?source=${treasury}&direction=out` +
            `&start_utime=${start}&end_utime=${end}&limit=${PAGE}&offset=${offset}&sort=desc`
        const data = await fetchURLAutoHandleRateLimit(url, RETRIES, headers)
        // A body without a messages array is a failure wearing a 200. Reading it as an empty page
        // would store the day as zero, which is the one outcome worth crashing to avoid.
        if (!Array.isArray(data?.messages)) {
            throw new Error('Expected a messages array from toncenter for ' + treasury)
        }
        const messages: any[] = data.messages
        for (const message of messages) {
            // logs are external-out, which the API reports with no destination
            if (message.destination !== null && message.destination !== undefined) continue
            const body = message.message_content?.body
            if (!body) continue
            const repayment = readRepayment(body)
            if (repayment) found.push(repayment)
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
        found.push(...(await repayments(treasury, options.startTimestamp, options.endTimestamp)))
    }

    let stakers = 0n
    let governor = 0n
    let burn = 0n
    for (const r of found) {
        stakers += r.stakers
        governor += r.governor
        burn += r.burn
    }

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

    // The borrower fee, forwarded to a contract that stakes it, buys HPO with the resulting hGRAM
    // on DeDust and burns it. HPO is a Notcoin-fork jetton, so the burn lowers total supply rather
    // than moving tokens to a dead address. It is charged on top of what the pool receives, out of
    // the borrower's own funds, so it never reduces the staker reward or moves the exchange rate --
    // additional gross income, and revenue on the holders' side.
    dailyFees.addGasToken(burn, METRIC.TOKEN_BUY_BACK)
    dailyUserFees.addGasToken(burn, METRIC.TOKEN_BUY_BACK)
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
    Fees: 'Validation rewards credited to the pool, summed from the treasury\'s repayment logs for the day, plus the borrower fee that is burned as HPO. The validators\' own share of a round\'s reward is deducted before the pool is credited, so it is not counted here.',
    UserFees: 'Stakers pay no fees for using Hipo. The borrowers the pool lends to, who are validators, pay a fee out of their own share of each round\'s reward.',
    SupplySideRevenue: 'Rewards credited to stakers, which reach them as a rise in the hGRAM exchange rate rather than as a separate claim.',
    ProtocolRevenue: 'The governance fee, deducted from the pool\'s reward before it reaches stakers. Its rate is set by Hipo\'s governor and can be zero.',
    HoldersRevenue: 'The borrower fee, which the treasury forwards to a swap-and-burn contract. That contract stakes the GRAM, buys HPO with the resulting hGRAM on DeDust, and burns it, lowering the total supply of HPO.',
    Revenue: 'The governance fee, plus the borrower fee that is burned as HPO.',
}

const breakdownMethodology = {
    Fees: {
        [METRIC.STAKING_REWARDS]: 'Validation rewards credited to the pool, net of the validators\' share.',
        [METRIC.TOKEN_BUY_BACK]: 'The borrower fee, taken from each borrower\'s contractual share of a round\'s reward.',
    },
    UserFees: {
        [METRIC.TOKEN_BUY_BACK]: 'The borrower fee, paid by validators out of their own share of a round\'s reward.',
    },
    SupplySideRevenue: {
        [METRIC.STAKING_REWARDS]: 'Rewards to stakers, delivered as a rise in the hGRAM exchange rate.',
    },
    ProtocolRevenue: {
        [METRIC.STAKING_REWARDS]: 'The governance fee, deducted from the pool\'s reward.',
    },
    HoldersRevenue: {
        [METRIC.TOKEN_BUY_BACK]: 'GRAM forwarded to the burner and spent buying HPO, which is then burned.',
    },
    Revenue: {
        [METRIC.STAKING_REWARDS]: 'The governance fee.',
        [METRIC.TOKEN_BUY_BACK]: 'The borrower fee, burned as HPO.',
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
