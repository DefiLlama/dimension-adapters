import { Adapter, ChainEndpoints, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { Bet, BetResult } from "./types";
import { Chain } from "../../adapters/types";
import { request, gql } from "graphql-request";

const endpoints: ChainEndpoints = {
    [CHAIN.POLYGON]: "https://thegraph.onchainfeed.org/subgraphs/name/azuro-protocol/azuro-api-polygon-v3",
    [CHAIN.XDAI]: "https://thegraph.onchainfeed.org/subgraphs/name/azuro-protocol/azuro-api-gnosis-v3",
    [CHAIN.BASE]: "https://thegraph.onchainfeed.org/subgraphs/name/azuro-protocol/azuro-api-base-v3",
    [CHAIN.CHILIZ]: "https://thegraph.onchainfeed.org/subgraphs/name/azuro-protocol/azuro-api-chiliz-v3",
};

const getStartTimestamp: { [chain: string]: number } = {
    [CHAIN.POLYGON]: 1675337850,
    [CHAIN.XDAI]: 1654807885,
    [CHAIN.BASE]: 1739303439,
    [CHAIN.CHILIZ]: 1720525553
};

const fetchV3Bets = async (url: string, from: number, to: number, skip: number): Promise<Bet[]> => {
    const query = gql`
        {
            v3Bets(
                where: {
                    status: Resolved,
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
    return response['v3Bets'] || [];
};

const fetchLegacyBets = async (
    url: string,
    from: number,
    to: number,
    skip: number,
    entityName: 'bets' | 'liveBets'
): Promise<Bet[]> => {
    const query = gql`
        {
            ${entityName}(
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
    return response[entityName] || [];
};

const fetchAllV3Bets = async (url: string, from: number, to: number): Promise<Bet[]> => {
    let bets: Bet[] = [];
    let skip = 0;
    while (true) {
        const newBets = await fetchV3Bets(url, from, to, skip);
        bets = [...bets, ...newBets];
        if (newBets.length < 1000) break;
        skip += 1000;
    }
    return bets;
};

const fetchAllLegacyBets = async (
    url: string,
    from: number,
    to: number,
    entityName: 'bets' | 'liveBets'
): Promise<Bet[]> => {
    let bets: Bet[] = [];
    let skip = 0;
    while (true) {
        const newBets = await fetchLegacyBets(url, from, to, skip, entityName);
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
            const [v3Bets, prematchBets, liveBets] = await Promise.all([
                fetchAllV3Bets(graphUrls[chain], startTimestamp, endTimestamp),
                fetchAllLegacyBets(graphUrls[chain], startTimestamp, endTimestamp, 'bets'),
                fetchAllLegacyBets(graphUrls[chain], startTimestamp, endTimestamp, 'liveBets')
            ]);

            const allBets = [...v3Bets, ...prematchBets, ...liveBets];

            const { totalBetAmount: dailyBetAmount, totalWonAmount: dailyWonAmount } = calculateAmounts(allBets);
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
        [CHAIN.BASE]: {
            fetch: graphs(endpoints)(CHAIN.BASE),
            start: getStartTimestamp[CHAIN.BASE],
        },
        [CHAIN.CHILIZ]: {
            fetch: graphs(endpoints)(CHAIN.CHILIZ),
            start: getStartTimestamp[CHAIN.CHILIZ],
        },
    },
    version: 2
};

export default adapter;
