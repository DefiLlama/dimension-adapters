import { Adapter, ChainBlocks, FetchOptions, ProtocolType } from "../adapters/types"
import { httpPost } from "../utils/fetchURL"
import { CHAIN } from "./chains"
import { getEnv } from "./env"

export const subscanConfigMap: any = {
    [CHAIN.POLKADOT]: {
        url: 'https://polkadot.api.subscan.io/api/v2/scan/daily',
        CGToken: 'polkadot',
        start: '2020-04-19',
        decimals: 10,
        burnRatio: 0,
    },
    [CHAIN.PENDULUM]: {
        url: 'https://pendulum.api.subscan.io/api/v2/scan/daily',
        CGToken: 'pendulum-chain',
        start: '2023-02-15',
        decimals: 12,
        burnRatio: 0,
    },
    [CHAIN.PEAQ]: {
        url: 'https://peaq.api.subscan.io/api/v2/scan/daily',
        CGToken: 'peaq-2',
        start: '2024-06-12',
        decimals: 18,
        burnRatio: 0,
    },
    [CHAIN.NEUROWEB]: {
        url: 'https://neuroweb.api.subscan.io/api/v2/scan/daily',
        CGToken: 'neurowebai',
        start: '2024-04-21',
        decimals: 12,
        burnRatio: 0,
    },
    [CHAIN.MYTHOS]: {
        url: 'https://mythos.api.subscan.io/api/v2/scan/daily',
        CGToken: 'mythos',
        start: '2024-07-17',
        decimals: 18,
        burnRatio: 1,
    },
    [CHAIN.MOONBEAM]: {
        url: 'https://moonbeam.api.subscan.io/api/v2/scan/daily',
        CGToken: 'moonbeam',
        start: '2022-06-20',
        decimals: 18,
        burnRatio: 1,
    },
    [CHAIN.HEIMA]: {
        url: 'https://heima.api.subscan.io/api/v2/scan/daily',
        CGToken: 'heima',
        start: '2025-02-14',
        decimals: 18,
        burnRatio: 1,
    },
    [CHAIN.KARURA]: {
        url: 'https://karura.api.subscan.io/api/v2/scan/daily',
        CGToken: 'karura',
        start: '2021-07-27',
        decimals: 12,
        burnRatio: 0.2,
    },
    [CHAIN.KUSAMA]: {
        url: 'https://kusama.api.subscan.io/api/v2/scan/daily',
        CGToken: 'kusama',
        start: '2020-07-18',
        decimals: 12,
        burnRatio: 0.2,
    },
}

export function subscanFeeAdapter(chain: string) {
    const config = subscanConfigMap[chain]
    if (!config) throw new Error(`No subscan config for chain ${chain}`)
    const { url, CGToken, start, decimals } = config

    if (!url || !CGToken || !start || !decimals) throw new Error(`Invalid subscan config for chain ${chain}`)

    const apikey = getEnv('SUBSCAN_API_KEY')
    if (!apikey) throw new Error('SUBSCAN_API_KEY is not set')

    const adapter: Adapter = {
        version: 1,
        adapter: {
            [chain]: {
                fetch: async (_timestamp: number, _: ChainBlocks, options: FetchOptions) => {
                    const dailyFees = options.createBalances()

                    const subscanResponse = await httpPost(url, {
                        category: "Fee",
                        start: options.dateString,
                        end: options.dateString,
                        format: "day"
                    },
                        {
                            headers: {
                                'Content-Type': 'application/json',
                                'X-API-Key': apikey
                            }
                        }
                    )

                    if (subscanResponse.code !== 0 || !subscanResponse.data || !subscanResponse.data.list.length)
                        throw new Error(`No data returned from Subscan for chain ${chain} on date ${options.dateString}`)

                    const todaysData = subscanResponse.data.list.find((d: any) => d.time_utc === `${options.dateString}T00:00:00Z`);

                    if (!todaysData)
                        throw new Error(`No data returned from Subscan for chain ${chain} on date ${options.dateString}`)

                    dailyFees.addCGToken(CGToken, Number(todaysData.total) / (10 ** decimals))

                    if (config.burnRatio !== undefined && config.burnRatio !== null) {
                        if (chain === CHAIN.MOONBEAM && options.dateString <= '2025-03-13') {
                            config.burnRatio = 0.8;
                        }
                        const dailyRevenue = dailyFees.clone(config.burnRatio);
                        return {
                            dailyFees,
                            dailyRevenue,
                            dailyHoldersRevenue: dailyRevenue
                        }
                    }

                    return {
                        dailyFees,
                    }
                },
                start,
            }
        },
        protocolType: ProtocolType.CHAIN
    }

    return adapter
}
