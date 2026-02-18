import { request, gql } from "graphql-request";
import { Chain } from  "../../adapters/types";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";
import { BreakdownAdapter, FetchV2, SimpleAdapter } from "../../adapters/types";

const endpoints: { [key: string]: string } = {
    [CHAIN.ARBITRUM]: "https://graph-arbitrum.equation.trade/subgraphs/name/equation-stats-v3-arbitrum",
}

const methodology = {
    Fees: "Fees from open/close position and placed limit order (0.05%),  with invitation code (0.045%)",
    Revenue: "Revenue is 50% of all collected fees",
    ProtocolRevenue: "Revenue is 50% of all collected fees"
}

const queryFee = gql`
query query_volume($id: String!) {
  protocolStatistics(where: {id: $id}) {
        stakeFee
        architectFee
        protocolFee
    }
}
`

interface IDailyResponse {
    protocolStatistics: [
        {
            protocolFee: string,
            architectFee: string,
            stakeFee: string,
        }
    ]
}

const getFetch = () => (chain: string): FetchV2 => async ({ startOfDay }) => {
    if (startOfDay > 1743940800) return {}
    const graphRes: IDailyResponse = await request(endpoints[chain], queryFee, {
        id: 'Daily:' + startOfDay,
    })
    const dailyFee = graphRes.protocolStatistics[0].protocolFee
    const dailyProtocolRevenue = parseFloat(graphRes.protocolStatistics[0].architectFee) + parseFloat(graphRes.protocolStatistics[0].stakeFee)

    return {
        timestamp: startOfDay,
        dailyFees: dailyFee.toString(),
        dailyProtocolRevenue: dailyProtocolRevenue.toString(),
    };
};

const adapter: SimpleAdapter = {
    version: 2,
    deadFrom: "2025-04-06",
    adapter: {
        [CHAIN.ARBITRUM]: {
            fetch: getFetch()(CHAIN.ARBITRUM),
            start: '2024-05-13',
        },
    },
    methodology
}

export default adapter;