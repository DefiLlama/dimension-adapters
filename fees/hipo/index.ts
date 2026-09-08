import { FetchOptions, FetchResultV2, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'
import { METRIC } from '../../helpers/metrics'
import fetchURL, { postURL } from '../../utils/fetchURL'

const treasury = 'EQCLyZHP4Xe8fpchQz76O-_RmUhaVc_9BAoGyJrwJrcbz2eZ'

// The treasury, as toncenter reports a message source. Compared against, so it has to be the raw
// form rather than the friendly one above.
const treasuryRaw = '0:8BC991CFE177BC7E9721433EFA3BEFD199485A55CFFD040A06C89AF026B71BCF'

// The swap-and-burn contract hardcoded in the treasury (contracts/imports/constants.fc, burner::addr).
// GRAM sent here is staked into Hipo, the hGRAM buys HPO on DeDust, and the HPO is burned -- a real
// supply reduction, since HPO is a Notcoin-fork jetton, not a transfer to an unspendable address.
const burner = 'EQAGPJMxJ73OLpHUgQhI5YeQe2ZuAuUQ-4f_zfN4rV2Fl6Jp'
const burnerRaw = '0:063C933127BDCE2E91D4810848E587907B666E02E510FB87FFCDF378AD5D8597'
const opTakeBorrowerFee = '0x5e2d81f4'

const ONE_DAY = 60 * 60 * 24

// GRAM the treasury forwarded to the burner in this window, in nanoGRAM. This is measured from the
// payments themselves rather than derived from the treasury's state, because nothing in the state
// records it: the fee is a fraction of each borrower's *contractual* share of a round's reward,
// which lives in the individual loan request, and the burner's own counters are cumulative totals
// that a single snapshot cannot difference.
//
// Only the treasury's op::take_borrower_fee payments count. The burner takes GRAM from anyone -- it
// treats any payment as a trigger -- but a third party's donation is not Hipo's income.
async function borrowerFeesBurned(start: number, end: number): Promise<bigint> {
    let burned = 0n
    let offset = 0
    const pageSize = 1000

    while (true) {
        const url =
            `https://toncenter.com/api/v3/transactions?account=${burner}` +
            `&start_utime=${start}&end_utime=${end}&limit=${pageSize}&offset=${offset}&sort=desc`
        const data = await fetchURL(url)
        const txs: any[] = data?.transactions ?? []
        if (!txs.length) break

        for (const tx of txs) {
            const inMsg = tx?.in_msg
            if (!inMsg) continue
            if (inMsg.opcode !== opTakeBorrowerFee) continue
            if (inMsg.source?.toUpperCase() !== treasuryRaw) continue
            if (inMsg.destination?.toUpperCase() !== burnerRaw) continue
            if (inMsg.bounced) continue
            if (!tx?.description?.action?.success) continue
            burned += BigInt(inMsg.value ?? 0)
        }

        if (txs.length < pageSize) break
        offset += pageSize
    }

    return burned
}

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
    const getTreasuryState = await postURL('https://toncenter.com/api/v3/runGetMethod', {
        address: treasury,
        method: 'get_treasury_state',
        stack: [],
    })
    if (getTreasuryState.exit_code !== 0) {
        throw new Error('Expected a zero exit code, but got ' + getTreasuryState.exit_code)
    }

    // get_treasury_state is append-only: a field is never inserted and never moved, so these
    // positions are fixed. Fields added since have gone on the end.
    const totalTokens = Number(getTreasuryState.stack[1].value)
    const previousRate = Number(getTreasuryState.stack[12].value)
    const currentRate = Number(getTreasuryState.stack[13].value)
    const windowDuration = Number(getTreasuryState.stack[14].value)
    const governanceFee = Number(getTreasuryState.stack[19].value)

    // The number of seconds current_rate took to grow out of previous_rate, measured on chain. Not
    // a round length: the treasury lends through two interleaved chains of rounds and
    // rounds_imbalance lets one chain lend more than the other, so the reward booked per settlement
    // alternates. The window is therefore kept two settlements wide -- one high chain and one low
    // one, so the alternation cancels -- and it widens further across rounds the pool did not lend
    // into. Normalising by a round length instead would report roughly double the truth, which is
    // what this adapter did until 2026-09.
    if (!Number.isFinite(windowDuration) || windowDuration <= 0) {
        throw new Error('Expected a positive window duration, but got ' + windowDuration)
    }

    // The reward that accrued to stakers over the window, in nanoGRAM. It is the rate move applied
    // to the whole hGRAM supply: total_coins = total_tokens * rate / 1e9, so a rate move of
    // (current - previous) is worth total_tokens * (current - previous) / 1e9 in coins.
    const newCoins = (totalTokens * (currentRate - previousRate)) / 1_000_000_000

    // governance_fee is a uint16 out of 65535, and set_governance_fee bounds it only by the
    // governor's signature -- 65535 is reachable, and it would divide by zero below.
    if (!Number.isFinite(governanceFee) || governanceFee < 0 || governanceFee >= 65535) {
        throw new Error('Expected a governance fee below 65535, but got ' + governanceFee)
    }

    // Not floored: newCoins is a scaled product, and flooring it would leave protocolFee holding
    // the negative fractional remainder -- a revenue of -1e-9 when the fee is zero, which it is on
    // mainnet today.
    const treasuryReward = (newCoins * 65535) / (65535 - governanceFee)
    const protocolFee = treasuryReward - newCoins

    const perDay = (x: number) => Math.round((x * ONE_DAY) / windowDuration)

    const burned = await borrowerFeesBurned(options.startTimestamp, options.endTimestamp)

    const dailyFees = options.createBalances()
    const dailyUserFees = options.createBalances()
    const dailySupplySideRevenue = options.createBalances()
    const dailyProtocolRevenue = options.createBalances()
    const dailyHoldersRevenue = options.createBalances()
    const dailyRevenue = options.createBalances()

    dailyFees.addGasToken(perDay(newCoins), METRIC.STAKING_REWARDS)
    dailyFees.addGasToken(perDay(protocolFee), METRIC.STAKING_REWARDS)
    dailySupplySideRevenue.addGasToken(perDay(newCoins), METRIC.STAKING_REWARDS)
    dailyProtocolRevenue.addGasToken(perDay(protocolFee), METRIC.STAKING_REWARDS)
    dailyRevenue.addGasToken(perDay(protocolFee), METRIC.STAKING_REWARDS)

    // The borrower fee is charged on top of what the pool receives, out of the borrower's own
    // funds, so it never reduces the staker reward above and never affects the exchange rate. It is
    // additional gross income that the protocol keeps -- as an HPO burn rather than as treasury
    // cash -- so it belongs in fees and in revenue, on the holders' side of the split.
    dailyFees.addGasToken(burned, METRIC.TOKEN_BUY_BACK)
    dailyUserFees.addGasToken(burned, METRIC.TOKEN_BUY_BACK)
    dailyHoldersRevenue.addGasToken(burned, METRIC.TOKEN_BUY_BACK)
    dailyRevenue.addGasToken(burned, METRIC.TOKEN_BUY_BACK)

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
    Fees: 'Staking rewards credited to the pool, measured from the on-chain hGRAM/GRAM exchange rate over the window the treasury publishes and normalised to a day, plus the borrower fee the treasury forwards to the HPO burner. The validators\' own share of a round\'s reward is already deducted before the pool is credited, so it is not counted here.',
    UserFees: 'Stakers pay no fees for using Hipo. Borrowers -- the validators the pool lends to -- pay a fee out of their own share of each round\'s reward.',
    SupplySideRevenue: 'Rewards credited to stakers, which they receive as the hGRAM exchange rate rising rather than as a separate claim.',
    ProtocolRevenue: 'The governance fee, taken out of the pool\'s reward before it reaches stakers. It is 0.00% on mainnet today.',
    HoldersRevenue: 'The borrower fee, which the treasury forwards to a swap-and-burn contract that stakes it, buys HPO with the resulting hGRAM on DeDust, and burns the HPO. HPO is a Notcoin-fork jetton, so the burn genuinely lowers total supply.',
    Revenue: 'The governance fee plus the borrower fee that is burned as HPO.',
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
        [METRIC.STAKING_REWARDS]: 'Rewards to stakers, delivered as a rising hGRAM exchange rate.',
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
            runAtCurrTime: true,
            start: '2023-10-30',
            fetch,
        },
    },
    methodology,
    breakdownMethodology,
}

export default adapter
