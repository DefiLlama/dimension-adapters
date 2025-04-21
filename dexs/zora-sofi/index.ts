import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

const fetch: any = async (_a, _b, options: FetchOptions) => {
    // we only count the contract volumes not the pool volumes(as pool volumes will be already counted in the uniswap pools)
    const volumeRes = await queryDuneSql(options, `
    WITH combined_volume AS (
        -- Buy volume
        SELECT 
            amountSold * p.price as volume_usd,
            buyer as trader
        FROM zora_base.coin_evt_coinbuy cb
        LEFT JOIN prices.usd_latest p 
            ON p.contract_address = cb.currency 
            AND p.blockchain = 'base'
            AND cb.evt_block_time >= from_unixtime(${options.startTimestamp})
            AND cb.evt_block_time < from_unixtime(${options.endTimestamp})

        UNION ALL
        
        -- Sell volume
        SELECT 
            amountPurchased * p.price as volume_usd,
            seller as trader
        FROM zora_base.coin_evt_coinsell cs
        LEFT JOIN prices.usd_latest p 
            ON p.contract_address = cs.currency 
            AND p.blockchain = 'base'
            AND cs.evt_block_time >= from_unixtime(${options.startTimestamp})
            AND cs.evt_block_time < from_unixtime(${options.endTimestamp})
    )
    SELECT 
        sum(cv.volume_usd)/pow(10,18) as coin_contract_volume
    FROM combined_volume cv 
    `);
    const dailyVolume = volumeRes[0].coin_contract_volume
    return { dailyVolume }
}

const adapter: SimpleAdapter = {
    version: 1,
    adapter: {
        [CHAIN.BASE]: {
            fetch: fetch,
            start: '2025-02-19',
        },
    },
    isExpensiveAdapter: true,
};

export default adapter;
