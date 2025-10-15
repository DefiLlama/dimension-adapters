import { Adapter, ChainEndpoints, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { Bet, BetResult } from "./types";
import { Chain } from "../../adapters/types";
import { request, gql } from "graphql-request";

const endpoints: ChainEndpoints = {
    [CHAIN.POLYGON]: "https://thegraph.azuro.org/subgraphs/name/azuro-protocol/azuro-api-polygon-v3",
    [CHAIN.XDAI]: "https://thegraph.azuro.org/subgraphs/name/azuro-protocol/azuro-api-gnosis-v3",
    [CHAIN.ARBITRUM]: "https://thegraph.azuro.org/subgraphs/name/azuro-protocol/azuro-api-arbitrum-one-v3",
    [CHAIN.LINEA]: "https://thegraph.bookmaker.xyz/subgraphs/name/azuro-protocol/azuro-api-linea-v3",
    [CHAIN.CHILIZ]: "https://thegraph.bookmaker.xyz/subgraphs/name/azuro-protocol/azuro-api-chiliz-v3"
};

const getStartTimestamp: { [chain: string]: number } = {
    [CHAIN.POLYGON]: 1675209600,
    [CHAIN.XDAI]: 1654646400,
    [CHAIN.ARBITRUM]: 1686009600,
    [CHAIN.LINEA]: 1691452800,
    [CHAIN.CHILIZ]: 1716422400
};

const fetchBets = async (url: string, from: number, to: number, skip: number, live = false): Promise<Bet[]> => {
    const query = gql`
        {
            ${live ? 'liveBets' : 'bets'}(
                where: {
                    status: Resolved,
                    _isFreebet: false,
                    resolvedBlockTimestamp_gte: ${from},
                    resolvedBlockTimestamp_lte: ${to}
                },
                first: 1000,
                skip: ${skip}
            ) {
                amount
                odds
                result
            }
        }
    `;
    const response = await request(url, query);
    return response[live ? 'liveBets' : 'bets'];
};

const fetchAllBets = async (url: string, from: number, to: number, live = false): Promise<Bet[]> => {
    let bets: Bet[] = [];
    let skip = 0;
    while (true) {
        const newBets = await fetchBets(url, from, to, skip, live);
        bets = [...bets, ...newBets];
        if (newBets.length < 1000) break;
        skip += 1000;
    }
    return bets;
};

const calculateAmounts = (bets: Bet[]) => {
    const totalBetAmount = bets.reduce((sum, { amount }) => sum + Number(amount), 0);
    const totalWonAmount = bets
        .filter(({ result }) => result === BetResult.Won)
        .reduce((sum, { amount, odds }) => sum + Number(amount) * Number(odds), 0);
    return { totalBetAmount, totalWonAmount };
};

const graphs = (graphUrls: ChainEndpoints) => {
    return (chain: Chain) => {
        return async ({ endTimestamp, startTimestamp }: FetchOptions) => {
            const [bets] = await Promise.all([
                fetchAllBets(graphUrls[chain], startTimestamp, endTimestamp, false),
            ]);

            const { totalBetAmount: dailyBetAmount, totalWonAmount: dailyWonAmount } = calculateAmounts(bets);
            const dailyPoolProfit = dailyBetAmount - dailyWonAmount;
            return {
                dailyFees: dailyPoolProfit.toString(),
                dailyRevenue: dailyPoolProfit.toString()
            };
        };
    };
};

const methodology = {
    Fees: "Total pools profits (equals total bets amount minus total won bets amount)",
    Revenue: "Total pools profits (equals total bets amount minus total won bets amount)",
};

const adapter: Adapter = {
    methodology,
    allowNegativeValue: true, // https://gem.azuro.org/knowledge-hub/how-azuro-works/protocol-actors/liquidity-providers
    adapter: {
        [CHAIN.POLYGON]: {
            fetch: graphs(endpoints)(CHAIN.POLYGON),
            start: getStartTimestamp[CHAIN.POLYGON],
        },
        [CHAIN.XDAI]: {
            fetch: graphs(endpoints)(CHAIN.XDAI),
            start: getStartTimestamp[CHAIN.XDAI],
        },
        [CHAIN.ARBITRUM]: {
            fetch: graphs(endpoints)(CHAIN.ARBITRUM),
            start: getStartTimestamp[CHAIN.ARBITRUM],
        },
        [CHAIN.LINEA]: {
            fetch: graphs(endpoints)(CHAIN.LINEA),
            start: getStartTimestamp[CHAIN.LINEA],
        },
        [CHAIN.CHILIZ]: {
            fetch: graphs(endpoints)(CHAIN.CHILIZ),
            start: getStartTimestamp[CHAIN.CHILIZ],
        },
    },
    version: 2
};

export default adapter;
