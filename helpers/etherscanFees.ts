import { Adapter, ChainBlocks, FetchOptions, ProtocolType } from "../adapters/types";
import { httpPost } from '../utils/fetchURL';


export async function getEtherscanFees({ startOfDay, }: FetchOptions, url: string) {
    const dailyFees = await httpPost(url, {
        responseType: 'blob', headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.169 Safari/537.36",
            "Content-Type": "text/csv; charset=utf-8",
            "Accept": "text/csv; charset=utf-8",
            "origin": url,
        }
    });
    const feesToday = dailyFees.split("\n").find((d: any) => d?.split(",")?.[1]?.slice(1, -1) == startOfDay)
    return Number(feesToday?.split(",")[2].slice(1, -2))
}

export function etherscanFeeAdapter(chain: string, url: string, cgToken?: string) {
    const adapter: Adapter = {
        adapter: {
            [chain]: {
                fetch: async (_timestamp: number, _: ChainBlocks, options: FetchOptions) => {
                    const amount = await getEtherscanFees(options, url)
                    const dailyFees = options.createBalances()
                    if (cgToken)
                        dailyFees.addCGToken(cgToken, amount / 1e18)
                    else
                        dailyFees.addGasToken(amount)

                    if (options.chain === 'fantom') {
                        const dailyRevenue = dailyFees.clone(0.3)
                        return { timestamp: options.startOfDay, dailyFees, dailyRevenue }
                    }

                    return {
                        timestamp: options.startOfDay, dailyFees,
                    };
                },
                start: 1690761600
            },
        },
        protocolType: ProtocolType.CHAIN
    }

    return adapter
}

/*
Broken fees:
- Boba chart is empty
- Cronos has a weird drop + their current fees are way too long, seems wrong
*/
