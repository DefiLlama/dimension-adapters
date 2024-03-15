import { request, gql } from "graphql-request";
import { Chain } from '@defillama/sdk/build/general';
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";
import { BreakdownAdapter, Fetch, SimpleAdapter } from "../../adapters/types";

const endpoints: { [key: string]: string } = {
    [CHAIN.ARBITRUM]: "https://graph-arbitrum.equation.trade/subgraphs/name/equation-stats-v2-arbitrum",
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

const getFetch = () => (chain: string): Fetch => async (timestamp: number) => {
    const todaysTimestamp = getUniqStartOfTodayTimestamp(new Date((timestamp * 1000)))
    const graphRes: IDailyResponse = await request(endpoints[chain], queryFee, {
        id: 'Daily:' + todaysTimestamp,
    })
    const dailyFee = graphRes.protocolStatistics[0].protocolFee
    const dailyProtocolRevenue = parseFloat(graphRes.protocolStatistics[0].architectFee) + parseFloat(graphRes.protocolStatistics[0].stakeFee)

    return {
        timestamp: todaysTimestamp,
        dailyFees: dailyFee.toString(),
        dailyProtocolRevenue: dailyProtocolRevenue.toString(),
    };
};

const adapter: SimpleAdapter = {
    adapter: {
        [CHAIN.ARBITRUM]: {
            fetch: getFetch()(CHAIN.ARBITRUM),
            start: 1706227200,
            meta: {
                methodology
            }
        },
    }
}

export default adapter;