import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import request, { gql } from "graphql-request";
import { CHAIN } from "../../helpers/chains";

const GRAPH_URL = 'https://api.goldsky.com/api/public/project_cmesjqx64lbfh01wc6z2q9tb0/subgraphs/winnieswap3/3.0.0/gn'

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

    const dailyRevenue = dailyFees.clone(0)
    const dailyProtocolRevenue = dailyFees.clone(0)
    const dailySupplySideRevenue = dailyFees.clone(1)
    const dailyHoldersRevenue = dailyFees.clone(0)

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
    Revenue: "0% protocol revenue share and 0% holders revenue share.",
    ProtocolRevenue: "0% of fees collected by the protocol.",
    SupplySideRevenue: "100% of fees distributed to LPs.",
    HoldersRevenue: "0% of fees used for buy-back and burn.",
    UserFees: "Total swap fees paid by users."
}

const adapter: SimpleAdapter = {
    version: 2,
    adapter: {
        [CHAIN.BERACHAIN]: {
            fetch,
            start: '2025-07-07',
            meta: { methodology }
        }
    }
}

export default adapter
