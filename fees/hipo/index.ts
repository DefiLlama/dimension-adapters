import { CHAIN } from '../../helpers/chains'
import { postURL } from '../../utils/fetchURL'
import * as sdk from '@defillama/sdk'

const address = 'EQCLyZHP4Xe8fpchQz76O-_RmUhaVc_9BAoGyJrwJrcbz2eZ'

export default {
    methodology: {
        UserFees: 'Stakers pay no fees for using Hipo.',
        ProtocolRevenue: 'Hipo receives a small fee before distributing rewards to stakers.',
        SupplySideRevenue: 'Stakers receive the rest of the rewards, after deducting validators share and protocol fee.',
        HoldersRevenue: 'Currently there is no governance token.',
        Revenue: 'All generated revenue is from protocol fee.',
        Fees: 'The total reward is calculated after deducting validators share, so it is the stakers revenue plus protocol revenue.',
    },
    version: 2,
    adapter: {
        [CHAIN.TON]: {
            runAtCurrTime: true,
            start: '2023-10-30',
            fetch: async () => {
                const getTreasuryState = await postURL('https://toncenter.com/api/v3/runGetMethod', {
                    address,
                    method: 'get_treasury_state',
                    stack: [],
                })
                if (getTreasuryState.exit_code !== 0) {
                    throw new Error('Expected a zero exit code, but got ' + getTreasuryState.exit_code)
                }

                // get_treasury_state mirrors the treasury's storage order. The upgrade of 2026-09-06
                // inserted deficit at index 5 and round_duration + last_settled_round after the rate
                // pair, taking the tuple from 21 values to 24, so every index from 5 on moved.
                const totalTokens = Number(getTreasuryState.stack[1].value)
                const previousRate = Number(getTreasuryState.stack[12].value)
                const currentRate = Number(getTreasuryState.stack[13].value)
                const roundDuration = Number(getTreasuryState.stack[14].value)
                const governanceFee = Number(getTreasuryState.stack[19].value)

                // round_duration is the number of seconds current_rate took to grow out of
                // previous_rate, measured on chain between the last two settled rounds. It replaces
                // the round length that used to come from a second get_times call: the treasury only
                // moves the rates when a round it lent into settles, so a round in which nothing was
                // lent widens this interval rather than passing unnoticed.
                //
                // One caveat, in the contract rather than here. The treasury moves the rate pair on
                // every settlement but only advances round_duration when a round settles in order,
                // so the two are exactly paired in steady state and briefly mismatched if the
                // elector rejects a newer round's stake and it settles ahead of an older round that
                // is still validating. Two readings then normalise one round's reward over a
                // two-round window -- understating, never overstating -- and the next in-order
                // settlement restores the pairing. Their sum over that window is still the correct
                // time-average, so a daily sampler sees the right figure on average.
                //
                // Zero on a treasury that has never settled a round, which would make normalize()
                // return Infinity and carry it into the USD conversion. Mainnet cannot be in that
                // state -- the migration seeded round_duration from the network's round length --
                // but the sibling yield adaptor guards the same value, so this one does too.
                if (!Number.isFinite(roundDuration) || roundDuration <= 0) {
                    throw new Error('Expected a positive round duration, but got ' + roundDuration)
                }

                const normalize = normalizer(roundDuration)

                // The reward that accrued to stakers, in nanoGRAM. It is the rate move applied to the
                // whole hGRAM supply -- total_coins = total_tokens * rate / 1e9, so a rate move of
                // (current - previous) is worth total_tokens * (current - previous) / 1e9 in coins.
                // Indices 11 and 12 used to hold last_staked and last_recovered, and this adapter was
                // still subtracting them as if they were coin amounts long after the treasury
                // replaced those fields with the 1e9-scaled rate pair. That reported a few hundred
                // thousand nanoGRAM per round -- about six millionths of the real figure.
                const newCoins = (totalTokens * (currentRate - previousRate)) / 1_000_000_000
                // governance_fee is a uint16 out of 65535, and set_governance_fee in the treasury
                // bounds it only by the governor's signature -- 65535 is a reachable value, and it
                // would divide by zero below and publish Infinity. Reject it rather than emit it.
                if (!Number.isFinite(governanceFee) || governanceFee < 0 || governanceFee >= 65535) {
                    throw new Error('Expected a governance fee below 65535, but got ' + governanceFee)
                }

                // Not floored. newCoins used to be a difference of two integers, so flooring the
                // reward was a no-op; it is a scaled product now, and flooring it leaves protocolFee
                // holding the negative fractional remainder -- a revenue of -1e-9 when the fee is 0.
                const treasuryReward = newCoins * 65535 / (65535 - governanceFee)
                const protocolFee = treasuryReward - newCoins

                const supplySideRevenue = newCoins / 1000000000
                const holdersRevenue = 0
                const protocolRevenue = protocolFee / 1000000000
                const revenue = holdersRevenue + protocolRevenue
                const userFees = 0
                const fees = supplySideRevenue + protocolRevenue

                const toNumber = async (obj: any) => await sdk.Balances.getUSDString(obj as any) as any

                return {
                    dailySupplySideRevenue: await toNumber({ 'coingecko:the-open-network': normalize(supplySideRevenue) }),
                    dailyHoldersRevenue: await toNumber({ 'coingecko:the-open-network': normalize(holdersRevenue) }),
                    dailyProtocolRevenue: await toNumber({ 'coingecko:the-open-network': normalize(protocolRevenue) }),
                    dailyRevenue: await toNumber({ 'coingecko:the-open-network': normalize(revenue) }),
                    dailyUserFees: await toNumber({ 'coingecko:the-open-network': normalize(userFees) }),
                    dailyFees: await toNumber({ 'coingecko:the-open-network': normalize(fees) }),
                }
            },
        },
    },
}

function normalizer(durationInSeconds: number): ((x: number) => string) {
    const oneDayInSeconds = 60 * 60 * 24
    return (x: number): string => {
        return (x * oneDayInSeconds / durationInSeconds).toFixed(9)
    }
}
