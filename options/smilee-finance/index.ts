import { gql, request } from "graphql-request";
import { Fetch, FetchOptions, FetchResultOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import * as sdk from "@defillama/sdk";

interface Trade {
    notionalUp: string;
    notionalDown: string;
    premium: string;
}

interface CumulativeData {
    cumulativeVolume: string;
    cumulativePremium: string;
}

const BASE_TOKEN = "0xaf88d065e77c8cc2239327c5edb3a432268e5831";
const SUBGRAPH_URL = "https://api.studio.thegraph.com/proxy/64770/smilee-finance/version/latest";

const tradeQuery = gql`
    query trades($timestampFrom: Int!, $timestampTo: Int!) {
        trades(where: {timestamp_gt: $timestampFrom, timestamp_lte: $timestampTo}) {
            notionalUp
            notionalDown
            premium
        }
    }`;

const cumulativeStatsQuery = gql`
    query trades {
        protocolStatistics {
            cumulativeVolume
            cumulativePremium
        }
    }`;

const fetch: Fetch = async (timestamp, _: any, options: FetchOptions) => {

    const tradedNotional = new sdk.Balances({ chain: CHAIN.ARBITRUM, timestamp });
    const tradedPremium = new sdk.Balances({ chain: CHAIN.ARBITRUM, timestamp });
    // const totalTradedNotional = new sdk.Balances({ chain: CHAIN.ARBITRUM });
    // const totalTradedPremium = new sdk.Balances({ chain: CHAIN.ARBITRUM });

    // Fetching daily trades
    const tradeResponse = await request(SUBGRAPH_URL, tradeQuery, {
        timestampFrom: options.fromTimestamp,
        timestampTo: options.toTimestamp,
    }) as { trades: Trade[] };

    tradeResponse.trades
        .filter((i) => Number(i.notionalUp)/1e6 < 10_000_000)
        .filter((i) => Number(i.notionalDown)/1e6 < 10_000_000)
        .filter((i) => Number(i.premium)/1e6 < 10_000_000)
        .forEach((trade: Trade) => {
        tradedNotional.add('usd', (Number(trade.notionalUp) + Number(trade.notionalDown)) / 1e6, { skipChain: true });
        tradedPremium.add('usd', Number(trade.premium) / 1e6, { skipChain: true });
    });

    // Fetching cumulative statistics
    // const statsResponse = await request(SUBGRAPH_URL, cumulativeStatsQuery) as { protocolStatistics: CumulativeData };
    // totalTradedNotional.add('usd', Number() / 1e6);
    // totalTradedPremium.add('usd', Number(statsResponse.protocolStatistics.cumulativePremium) / 1e6);

    // Building fetch result
    const fetchResult: FetchResultOptions = {
        timestamp: options.toTimestamp,
        dailyNotionalVolume: await tradedNotional.getUSDString(),
        dailyPremiumVolume: await tradedPremium.getUSDString(),
        // totalNotionalVolume:  BigInt.(statsResponse.protocolStatistics.cumulativeVolume) / 1e6,
        // totalPremiumVolume: Number(statsResponse.protocolStatistics.cumulativePremium) / 1e6
    };

    return fetchResult;
};

const adapter = {
    adapter: {
        [CHAIN.ARBITRUM]: {
            fetch,
            start: 1710440552
        },
    }
};

export default adapter;
