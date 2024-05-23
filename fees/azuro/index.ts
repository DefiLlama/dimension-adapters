import {Adapter, ChainEndpoints, FetchResultFees} from "../../adapters/types";
import {CHAIN} from "../../helpers/chains";
import {Bet, BetResult} from "./types";
import {Chain} from "@defillama/sdk/build/general";
import {request, gql} from "graphql-request";
import {getTimestampAtStartOfDayUTC} from "../../utils/date";

const endpoints = {
    [CHAIN.POLYGON]: "https://thegraph.azuro.org/subgraphs/name/azuro-protocol/azuro-api-polygon-v3",
    [CHAIN.XDAI]: "https://thegraph.azuro.org/subgraphs/name/azuro-protocol/azuro-api-gnosis-v3",
    [CHAIN.ARBITRUM]: "https://thegraph.azuro.org/subgraphs/name/azuro-protocol/azuro-api-arbitrum-one-v3",
    [CHAIN.LINEA]: "https://thegraph.bookmaker.xyz/subgraphs/name/azuro-protocol/azuro-api-linea-v3"
}
type IStart = {
    [s: string | Chain]: number
}
const getStartTimestamp: IStart = {
    [CHAIN.POLYGON]: 1675209600,
    [CHAIN.XDAI]: 1654646400,
    [CHAIN.ARBITRUM]: 1686009600,
    [CHAIN.LINEA]: 1691452800
}

const graphs = (graphUrls: ChainEndpoints) => {
    return (chain: Chain) => {
        return async (timestamp: number): Promise<FetchResultFees> => {
            const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp)
            const fromTimestamp = todaysTimestamp - 60 * 60 * 24
            const toTimestamp = todaysTimestamp
            const bets: Bet[] = []
            const total_bets: Bet[] = []
            let skip = 0

            while (true) {
                const graphQuery = gql`
                    {
                        bets(
                            where: {
                            status: Resolved,
                            _isFreebet: false
                            resolvedBlockTimestamp_gte: ${fromTimestamp},
                            resolvedBlockTimestamp_lte: ${toTimestamp},
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

            let skip_total = 0
            while (true) {
                const graphQuery = gql`
                    {
                        bets(
                            where: {
                            status: Resolved,
                            _isFreebet: false
                            resolvedBlockTimestamp_gte: ${getStartTimestamp[chain]},
                            resolvedBlockTimestamp_lte: ${toTimestamp},
                            }
                            first: 1000,
                            skip: ${skip_total}
                        ) {
                            amount
                            odds
                            result
                        }
                    }
                    `;
                const graphRes = await request(graphUrls[chain], graphQuery);

                total_bets.push(...graphRes.bets)
                skip_total += 1000
                if (graphRes.bets.length < 1000) break
            }
            const totalBetAmount = total_bets.reduce((e: number, {amount}) => e+Number(amount), 0);
            const totalWonAmount = total_bets.filter(({result}) => result === BetResult.Won)
                .reduce((e: number, {amount, odds}) => e+Number(amount) * Number(odds), 0);
            const totalFees = totalBetAmount - totalWonAmount;

            const dailyBetAmount = bets.reduce((e: number, {amount}) => e+Number(amount), 0)
            const dailyWonAmount = bets.filter(({result}) => result === BetResult.Won)
                                 .reduce((e: number, {amount, odds}) => e+Number(amount) * Number(odds), 0)

            const totalPoolProfit = dailyBetAmount - dailyWonAmount;
            const dailyFees = totalPoolProfit;
            const dailyRevenue = totalPoolProfit;

            return {
                timestamp,
                dailyFees: dailyFees.toString(),
                dailyRevenue: dailyRevenue.toString(),
                totalFees: totalFees.toString(),
                totalRevenue: totalFees.toString(),
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
            start: 1675209600,
            meta: {
                methodology
            }
        },
        [CHAIN.XDAI]: {
            fetch: graphs(endpoints)(CHAIN.XDAI),
            start: 1654646400,
            meta: {
                methodology
            }
        },
        [CHAIN.ARBITRUM]: {
            fetch: graphs(endpoints)(CHAIN.ARBITRUM),
            start: 1686009600,
            meta: {
                methodology
            }
        },
        [CHAIN.LINEA]: {
            fetch: graphs(endpoints)(CHAIN.LINEA),
            start: 1691452800,
            meta: {
                methodology
            }
        },

    }
}

export default adapter;
