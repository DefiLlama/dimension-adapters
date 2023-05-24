import {Adapter, ChainEndpoints} from "../../adapters/types";
import {CHAIN} from "../../helpers/chains";
import {Bet, BetResult} from "./types";
import {Chain} from "@defillama/sdk/build/general";
import {request, gql} from "graphql-request";
import {getTimestampAtStartOfDayUTC, getTimestampAtStartOfPreviousDayUTC} from "../../utils/date";

const endpoints = {
    [CHAIN.POLYGON]: "https://thegraph.bookmaker.xyz/subgraphs/name/azuro-protocol/azuro-api-polygon",
    [CHAIN.XDAI]: "https://thegraph.bookmaker.xyz/subgraphs/name/azuro-protocol/azuro-api-gnosis"
}

const graphs = (graphUrls: ChainEndpoints) => {
    return (chain: Chain) => {
        return async (timestamp: number) => {
            const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp)
            const yesterdaysTimestamp = getTimestampAtStartOfPreviousDayUTC(todaysTimestamp)
            const bets: Bet[] = []
            let skip = 0

            while (true) {
                const graphQuery = gql`
                    {
                        bets(
                            where: {
                            status: Resolved,
                            isFreebet: false
                            createdBlockTimestamp_gte: ${yesterdaysTimestamp},
                            createdBlockTimestamp_lte: ${todaysTimestamp},
                            }
                            first: 1000,
                            skip: ${skip}
                        ) {
                            amount
                            odds
                            result
                        }
                    }
                    `;
                const graphRes = await request(graphUrls[chain], graphQuery);

                bets.push(...graphRes.bets)
                skip += 1000

                if (graphRes.bets.length < 1000) break
            }

            const totalBetsAmount = bets.reduce((e: number, {amount}) => e+Number(amount), 0)
            const wonAmount = bets.filter(({result}) => result === BetResult.Won)
                                .reduce((e: number, {amount, odds}) => e+Number(amount) * Number(odds), 0)

            const totalPoolProfit = totalBetsAmount - wonAmount;
            const dailyFees = totalPoolProfit;
            const dailyRevenue = totalPoolProfit;

            return {
                timestamp,
                dailyFees: dailyFees.toString(),
                dailyRevenue: dailyRevenue.toString(),
            };
        }
    }
}

const methodology = {
    Fees: "Total pools profits (equals total bets amount minus total won bets amount)",
    Revenue: "Total pools profits (equals total bets amount minus total won bets amount)",
}

const adapter: Adapter = {
    adapter: {
        [CHAIN.POLYGON]: {
            fetch: graphs(endpoints)(CHAIN.POLYGON),
            start: async () => 1657756800,
            meta: {
                methodology
            }
        },
        [CHAIN.XDAI]: {
            fetch: graphs(endpoints)(CHAIN.XDAI),
            start: async () => 1657756800,
            meta: {
                methodology
            }
        },
    }
}

export default adapter;
