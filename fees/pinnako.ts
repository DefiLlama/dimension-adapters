import { Adapter, FetchOptions } from "../adapters/types";
import { gql, request } from "graphql-request";
import { CHAIN } from "../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../utils/date";

const endpoints: Record<string, string> = {
    [CHAIN.ERA]: "https://api.studio.thegraph.com/query/49418/zkmain_stats/version/latest",
};

const fetch = async (options: FetchOptions) => {
    const todaysTimestamp = getTimestampAtStartOfDayUTC(options.toTimestamp);

    const graphQuery = gql`{
                feeStat(id: "${todaysTimestamp}",period: "daily") {
                    mint
                    burn
                    marginAndLiquidation
                    swap
                }
            }`;

    const graphRes = await request(endpoints[options.chain], graphQuery);

    const dailyFee = (
        parseInt(graphRes?.feeStat?.mint || 0) +
        parseInt(graphRes?.feeStat?.burn || 0) +
        parseInt(graphRes?.feeStat?.marginAndLiquidation || 0) +
        parseInt(graphRes?.feeStat?.swap || 0)
    ) / 1e30
    const dailyUserFees = (
        parseInt(graphRes?.feeStat?.marginAndLiquidation || 0) +
        parseInt(graphRes?.feeStat?.swap || 0)
    ) / 1e30;

    return {
        dailyFees: dailyFee.toString(),
        dailyUserFees: dailyUserFees.toString(),
        dailyRevenue: (dailyFee * 0.3).toString()
    };
};

const adapter: Adapter = {
    fetch,
    chains: [CHAIN.ERA],
    start: '2022-12-10',
    methodology: {
        Fees: "All mint, burn, margin and liquidation and swap fees are collected",
        UserFees: "Users pay swap fees and margin and liquidation fees",
        Revenue: "Revenue is calculated as 30% of the total fee.",
    }
};

export default adapter;
