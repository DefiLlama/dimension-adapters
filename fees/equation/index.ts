import { request, gql } from "graphql-request";
import { Chain } from '@defillama/sdk/build/general';
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";
import { BreakdownAdapter, Fetch, SimpleAdapter } from "../../adapters/types";

const endpoints: { [key: string]: string } = {
    [CHAIN.ARBITRUM]: "https://graph-arbitrum.equation.trade/subgraphs/name/equation-stats-arbitrum/graphql",
}

const methodology = {
    Fees: "Fees from open/close position and placed limit order (0.05%),  with invitation code (0.045%)",
    Revenue: "Revenue is 50% of all collected fees",
    ProtocolRevenue: "Revenue is 50% of all collected fees"
}

const queryFee = gql`{
    protocolStatistic($id: String!) {
        protocolFee
        architectFee
        stakeFee
      }
}`

interface IDailyResponse {
    protocolStatistic: {
        protocolFee: string,
        architectFee: string,
        stakeFee: string,
    }
}

const getFetch = () => (chain: string): Fetch => async (timestamp: number) => {
    const todaysTimestamp = getUniqStartOfTodayTimestamp(new Date((timestamp * 1000)))
    const graphRes: IDailyResponse = await request(endpoints[chain], queryFee, {
        id: 'Daily:' + todaysTimestamp,
    })

    const dailyFee = parseInt(graphRes.protocolStatistic.protocolFee)
    const dailyProtocolRevenue = parseInt(graphRes.protocolStatistic.architectFee) + parseInt(graphRes.protocolStatistic.stakeFee)

    return {
        timestamp,
        dailyFees: dailyFee.toString(),
        dailyProtocolRevenue: dailyProtocolRevenue.toString(),
    };
};

const adapter: SimpleAdapter = {
    adapter: {
        [CHAIN.ARBITRUM]: {
            fetch: getFetch()(CHAIN.ARBITRUM),
            start: async () => 1697760000,
            meta: {
                methodology
            }
        },
    }
}

export default adapter;