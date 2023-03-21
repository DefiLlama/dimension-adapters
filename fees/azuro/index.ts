import {Adapter, ChainEndpoints} from "../../adapters/types";
import {POLYGON, XDAI} from "../../helpers/chains";
import {Bet, BetResult} from "./types";
import {Chain} from "@defillama/sdk/build/general";
import {request, gql} from "graphql-request";
import {getTimestampAtStartOfDayUTC, getTimestampAtStartOfPreviousDayUTC} from "../../utils/date";
import BigNumber from "bignumber.js";

const endpoints = {
    [POLYGON]: "https://thegraph.bookmaker.xyz/subgraphs/name/azuro-protocol/azuro-api-polygon",
    [XDAI]: "https://thegraph.bookmaker.xyz/subgraphs/name/azuro-protocol/azuro-api-gnosis"
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

            let dailyFees = new BigNumber(0)
            // amount - (amount * odds * won)
            bets.forEach(({ result, amount, odds }) => {
                if (result === BetResult.Won){
                    dailyFees = dailyFees.plus(Number(amount) - (Number(odds) * Number(amount)))
                }
                else {
                    dailyFees = dailyFees.plus(Number(amount))
                }
            })
            return {
                timestamp,
                dailyFees: dailyFees.toFixed(2),
                dailyRevenue: dailyFees.toFixed(2)
            };
        }
    }
}

const adapter: Adapter = {
    adapter: {
        [POLYGON]: {
            fetch: graphs(endpoints)(POLYGON),
            start: async () => 1609459200,
        },
        [XDAI]: {
            fetch: graphs(endpoints)(XDAI),
            start: async () => 1609459200,
        },
    }
}

export default adapter;
