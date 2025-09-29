import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import request, { gql } from "graphql-request";
import { CHAIN } from "../../helpers/chains";

const GRAPH_URL = 'https://api.goldsky.com/api/public/project_cm97l77ib0cz601wlgi9wb0ec/subgraphs/v3-subgraph/6.0.0/gn'

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
    const query = gql`
        query q{
            tokenDayDatas(where: {date: ${options.startOfDay}}, first: 1000, orderBy: volumeUSD, orderDirection: desc) {
                volumeUSD
                feesUSD
            }
        }
    `

    const data = await request(GRAPH_URL, query)
    const dailyVolume = options.createBalances()
    const dailyFees = options.createBalances()

    data.tokenDayDatas.forEach((e: any) => {
        dailyVolume.addUSDValue(Number(e.volumeUSD))
        dailyFees.addUSDValue(Number(e.feesUSD))
    })

    const dailyRevenue = dailyFees.clone(0.18)
    const dailyProtocolRevenue = dailyFees.clone(0.04)
    const dailySupplySideRevenue = dailyFees.clone(0.84)
    const dailyHoldersRevenue = dailyFees.clone(0.12)

    return {
        dailyVolume,
        dailyFees,
        dailyUserFees: dailyFees,
        dailyRevenue,
        dailyProtocolRevenue,
        dailySupplySideRevenue,
        dailyHoldersRevenue,
    }
}

const methodology = {
    Fees: "Total swap fees paid by users.",
    Revenue: "4% protocol revenue share and 12% holders revenue share.",
    ProtocolRevenue: "4% of fees collected by the protocol.",
    SupplySideRevenue: "84% of fees distributed to LPs.",
    HoldersRevenue: "12% of fees used for buy-back and burn.",
    UserFees: "Total swap fees paid by users."
}

const adapter: SimpleAdapter = {
    version: 2,
    methodology,
    adapter: {
        [CHAIN.HYPERLIQUID]: {
            fetch,
            start: '2025-02-18',
        }
    }
}

export default adapter
