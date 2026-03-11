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

                const getTimes = await postURL('https://toncenter.com/api/v3/runGetMethod', {
                    address,
                    method: 'get_times',
                    stack: [],
                })
                if (getTimes.exit_code !== 0) {
                    throw new Error('Expected a zero exit code, but got ' + getTimes.exit_code)
                }

                const lastStaked = Number(getTreasuryState.stack[11].value)
                const lastRecovered = Number(getTreasuryState.stack[12].value)
                const governanceFee = Number(getTreasuryState.stack[16].value)

                const currentRoundSince = Number(getTimes.stack[0].value)
                const nextRoundSince = Number(getTimes.stack[3].value)

                const duration = nextRoundSince - currentRoundSince
                const normalize = normalizer(duration)

                const newCoins = lastRecovered - lastStaked
                const treasuryReward = Math.floor(newCoins * 65535 / (65535 - governanceFee))
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
