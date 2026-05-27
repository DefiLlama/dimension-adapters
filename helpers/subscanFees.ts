import { Adapter, ChainBlocks, FetchOptions, ProtocolType } from "../adapters/types"
import { httpPost } from "../utils/fetchURL"
import { CHAIN } from "./chains"
import { getEnv } from "./env"

interface SubscanConfig {
    subscanName: string;
    CGToken: string;
    start: string;
    decimals: number;
    burnRatio: number;
}

export const subscanConfigMap: Record<string, SubscanConfig> = {
    [CHAIN.POLKADOT]: { subscanName: 'polkadot', CGToken: 'polkadot', start: '2020-04-19', decimals: 10, burnRatio: 0 },
    [CHAIN.PENDULUM]: { subscanName: 'pendulum', CGToken: 'pendulum-chain', start: '2023-02-15', decimals: 12, burnRatio: 0 },
    [CHAIN.PEAQ]: { subscanName: 'peaq', CGToken: 'peaq-2', start: '2024-06-12', decimals: 18, burnRatio: 0 },
    [CHAIN.NEUROWEB]: { subscanName: 'neuroweb', CGToken: 'neurowebai', start: '2024-04-21', decimals: 12, burnRatio: 0 },
    [CHAIN.MYTHOS]: { subscanName: 'mythos', CGToken: 'mythos', start: '2024-07-17', decimals: 18, burnRatio: 1 },
    [CHAIN.MOONBEAM]: { subscanName: 'moonbeam', CGToken: 'moonbeam', start: '2022-06-20', decimals: 18, burnRatio: 1 },
    [CHAIN.HEIMA]: { subscanName: 'heima', CGToken: 'heima', start: '2025-02-14', decimals: 18, burnRatio: 1 },
    [CHAIN.KARURA]: { subscanName: 'karura', CGToken: 'karura', start: '2021-07-27', decimals: 12, burnRatio: 0.2 },
    [CHAIN.KUSAMA]: { subscanName: 'kusama', CGToken: 'kusama', start: '2020-07-18', decimals: 12, burnRatio: 0.2 },
    [CHAIN.HYDRADX]: { subscanName: 'hydration', CGToken: 'hydradx', start: '2022-04-07', decimals: 12, burnRatio: 0 },
    [CHAIN.ROBONOMICS]: { subscanName: 'robonomics', CGToken: 'robonomics-network', start: '2024-12-13', decimals: 9, burnRatio: 0 },
    [CHAIN.DARWINIA]: { subscanName: 'darwinia', CGToken: 'darwinia-network-native-token', start: '2023-04-26', decimals: 18, burnRatio: 1 },
}

export function subscanFeeAdapter(chain: string) {
    const config = subscanConfigMap[chain]
    if (!config) throw new Error(`No subscan config for chain ${chain}`)
    const { CGToken, start, decimals, subscanName } = config

    if (!subscanName || !CGToken || !start || !decimals) throw new Error(`Invalid subscan config for chain ${chain}`)
    const url = `https://${subscanName}.api.subscan.io/api/v2/scan/daily`


    const adapter: Adapter = {
        version: 1,
        adapter: {
            [chain]: {
                fetch: async (_timestamp: number, _: ChainBlocks, options: FetchOptions) => {

                    const apikey = getEnv('SUBSCAN_API_KEY')
                    if (!apikey) throw new Error('SUBSCAN_API_KEY is not set')

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

                    if (subscanResponse.code !== 0 || !subscanResponse.data || !subscanResponse.data.list || !subscanResponse.data.list.length)
                        throw new Error(`No data returned from Subscan for chain ${chain} on date ${options.dateString}`)

                    const todaysData = subscanResponse.data.list.find((d: any) => d.time_utc === `${options.dateString}T00:00:00Z`);

                    if (!todaysData)
                        throw new Error(`No data returned from Subscan for chain ${chain} on date ${options.dateString}`)

                    dailyFees.addCGToken(CGToken, Number(todaysData.total) / (10 ** decimals))

                    if (config.burnRatio !== undefined && config.burnRatio !== null) {
                        const burnRatio = (chain === CHAIN.MOONBEAM && options.dateString <= '2025-03-13') ? 0.8 : config.burnRatio;
                        const dailyRevenue = dailyFees.clone(burnRatio);
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
