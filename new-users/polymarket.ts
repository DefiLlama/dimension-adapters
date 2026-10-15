import { Dependencies, SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryAllium } from "../helpers/allium";

// Polymarket order book exchanges on Polygon (excludes the Combos exchange, listed separately as polymarket-combos)
const exchanges = [
    '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E', // CTFExchange (v1)
    '0xC5d563A36AE78145C45a50134d48A1215220f80a', // NegRiskCtfExchange (v1)
    '0xE111180000d2663C0091e4f400237545B87B996B', // CTFExchange (v2)
    '0xe2222d279d744050d28e00520010520000310F59', // NegRiskCtfExchange (v2)
]

// OrderFilled topic0 per exchange version
const orderFilledTopics = [
    '0xd0a08e8c493f9c94f29311604c9de1b4e8c8d4c06bd0c789af57f2d65bfec0f6', // v1: OrderFilled(bytes32,address,address,uint256,uint256,uint256,uint256,uint256)
    '0xd543adfd945773f1a62f74f0ee55a5e3b9b1a28262980ba90b1a89f2ea84d8ee', // v2: OrderFilled(bytes32,address,address,uint8,uint256,uint256,uint256,uint256,bytes32,bytes32)
]

// Allium polygon.raw.logs lands within ~15 minutes of block time
const INDEXING_DELAY = 60 * 60;

const fetch = async (options: FetchOptions) => {
    if (options.endTimestamp > Date.now() / 1e3 - INDEXING_DELAY) {
        throw new Error('End timestamp is less than 1 hour ago, skipping due to Allium indexing delay');
    }

    const query = `
    WITH fills AS (
        SELECT block_timestamp, topic2 AS maker, topic3 AS taker
        FROM polygon.raw.logs
        WHERE address IN (${exchanges.map(a => `'${a.toLowerCase()}'`).join(', ')})
          AND topic0 IN (${orderFilledTopics.map(t => `'${t}'`).join(', ')})
          AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
    ),
    first_seen AS (
        SELECT trader, MIN(block_timestamp) AS first_ts
        FROM (
            SELECT block_timestamp, maker AS trader FROM fills
            UNION ALL
            SELECT block_timestamp, taker AS trader FROM fills
        )
        GROUP BY trader
    )
    SELECT COUNT_IF(first_ts >= TO_TIMESTAMP_NTZ(${options.startTimestamp})) AS new_users
    FROM first_seen
    `;

    const [row] = await queryAllium(query);
    if (!row || row.new_users === null || row.new_users === undefined) {
        throw new Error(`No Polymarket new users row for ${options.dateString}`);
    }

    return {
        dailyNewUsers: row.new_users,
    }
}

const adapter: SimpleAdapter = {
    // daily: each run scans the full fill history to find first trades, hourly runs would repeat it 24 times
    version: 1,
    fetch,
    chains: [CHAIN.POLYGON],
    dependencies: [Dependencies.ALLIUM],
    isExpensiveAdapter: true,
    start: "2020-09-30",
};

export default adapter;
