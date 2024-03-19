import { CHAIN } from '../../helpers/chains'
import { postURL } from '../../utils/fetchURL'
import * as sdk from '@defillama/sdk'

const address = 'EQBNo5qAG8I8J6IxGaz15SfQVB-kX98YhKV_mT36Xo5vYxUa'

export default {
    adapter: {
        [CHAIN.TON]: {
            runAtCurrTime: true,
            start: 1698685200,
            meta: {
                hallmarks: [
                    [1698685200, 'Hipo Launch'],
                ],
                methodology: {
                    UserFees: 'Stakers pay no fees for using Hipo.',
                    ProtocolRevenue: 'Hipo receives a small fee before distributing rewards to stakers.',
                    SupplySideRevenue: 'Stakers receive the rest of the rewards, after deducting validators share and protocol fee.',
                    HoldersRevenue: 'Currently there is not government token.',
                    Revenue: 'All generated revenue is from protocol fee.',
                    Fees: 'The total reward is calculated after deducting validators share, so it is the stakers revenue plus protocol revenue.',
                },
            },
            fetch: async () => {
                const response1 = await postURL('https://toncenter.com/api/v2/runGetMethod', {
                    address,
                    method: 'get_treasury_state',
                    stack: [],
                })
                if (!response1.ok) {
                    throw new Error('Error in calling toncenter.com/api/v2/runGetMethod')
                }
                const getTreasuryState = response1.result
                if (getTreasuryState.exit_code !== 0) {
                    throw new Error('Expected a zero exit code, but got ' + getTreasuryState.exit_code)
                }

                const response2 = await postURL('https://toncenter.com/api/v2/runGetMethod', {
                    address,
                    method: 'get_times',
                    stack: [],
                })
                if (!response2.ok) {
                    throw new Error('Error in calling toncenter.com/api/v2/runGetMethod')
                }
                const getTimes = response2.result
                if (getTimes.exit_code !== 0) {
                    throw new Error('Expected a zero exit code, but got ' + getTimes.exit_code)
                }

                const lastStaked = Number(getTreasuryState.stack[5][1])
                const lastRecovered = Number(getTreasuryState.stack[6][1])
                const governanceFee = Number(getTreasuryState.stack[16][1])

                const currentRoundSince = Number(getTimes.stack[0][1])
                const nextRoundSince = Number(getTimes.stack[3][1])

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
