import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

const chainConfig = {
    [CHAIN.BASE]: {
        chainKey: 'base',
        contract: 'a39A5f160a1952dDf38781Bd76E402B0006912A9',
        dune_table: 'base.transactions',
    },
    [CHAIN.ETHEREUM]: {
        chainKey: 'ethereum',
        contract: '0x20F780A973856B93f63670377900C1d2a50a77c4', // 示例
        dune_table: 'ethereum.transactions',
    },
    [CHAIN.ARBITRUM]: {
        chainKey: 'arbitrum',
        contract: '0x18cd9270DbdcA86d470cfB3be1B156241fFfA9De', // 示例
        dune_table: 'arbitrum.transactions',
    },
};

const selectors = [
    'b18d619f',
    'a8809485',
    '496c5a55',
    '744773f1',
];

const prefetch = async (options: FetchOptions) => {
    const results = await Promise.all(
        Object.entries(chainConfig).map(async ([chain, { chainKey, contract, dune_table }]) => {
            const sql = `
                WITH filtered AS (
                    SELECT
                        t.hash AS tx_hash,
                        t.block_time,
                        t.value / 1e18 AS eth_amount
                    FROM ${dune_table} t
                    WHERE
                        t.block_time >= FROM_UNIXTIME(${options.startTimestamp})
                      AND t.block_time <  FROM_UNIXTIME(${options.endTimestamp})
                      AND t."to" = from_hex('${contract.replace(/^0x/, "")}')
                      AND varbinary_substring(t.data, 1, 4) IN (
                        ${selectors.map(sel => `from_hex('${sel}')`).join(", ")}
                        )
                      AND t.value > 0
                ),
                     joined AS (
                         SELECT
                             f.tx_hash,
                             f.block_time,
                             f.eth_amount,
                             COALESCE(p.price, 0) * f.eth_amount AS usd_amount
                         FROM filtered f
                                  LEFT JOIN prices.usd p
                                            ON date_trunc('minute', f.block_time) = date_trunc('minute', p.minute)
                                                AND p.symbol = 'ETH'
                     ),
                     deduplicated AS (
                         SELECT
                             tx_hash,
                             MAX(block_time) AS block_time,
                             MAX(eth_amount) AS eth_amount,
                             MAX(usd_amount) AS usd_amount
                         FROM joined
                         GROUP BY tx_hash
                     )

                SELECT
                    COUNT(*) AS total_transactions,
                    ROUND(SUM(eth_amount), 4) AS total_eth,
                    ROUND(SUM(usd_amount), 2) AS total_usd
                FROM deduplicated;
            `;
            const data = await queryDuneSql(options, sql);
            return [chain, data?.[0] ?? {}]; // return tuple
        })
    );

    return Object.fromEntries(results); // ✅ shape: { [chain]: { total_usd, ... } }
};

const fetch = async (_: any, __: any, options: FetchOptions) => {
    const results = options.preFetchedResults ?? [];
    const data = results[options.chain];  // ✅ 正确地按 chain key 取值

    return {
        dailyVolume: data?.total_usd ?? 0,
    };
};

const adapter: SimpleAdapter = {
    version: 1,
    fetch,
    prefetch,
    chains: Object.keys(chainConfig) as string[],
    doublecounted: true,
};

export default adapter;