import { Adapter, Dependencies, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
    const volumeRes = await queryDuneSql(options, `
        select
            SUM(amount_usd) as volume
        from dex.trades
        where blockchain = 'unichain'
            and project = 'uniswap'
            and version = '4'
            and tx_hash in (
                select
                    evt_tx_hash
                from uniswap_v4_unichain.poolmanager_evt_swap
                where id in (
                        select
                            id
                        from uniswap_v4_unichain.poolmanager_evt_initialize
                        where hooks = 0xcc2efb167503f2d7df0eae906600066aec9e8444))
            and block_time >= from_unixtime(${options.startTimestamp})
                        AND block_time < from_unixtime(${options.endTimestamp})
    `);
    const dailyVolume = volumeRes[0].volume;

    return {
        dailyVolume
    }
}

const adapter: Adapter = {
    version: 1,
    dependencies: [Dependencies.DUNE],
    adapter: {
        [CHAIN.UNICHAIN]: {
            fetch: fetch as any,
            start: '2025-05-29'
        },
    },
    isExpensiveAdapter: true
}

export default adapter;