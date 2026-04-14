import { Dependencies, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { FetchOptions } from "../../adapters/types";

interface IData {
    daily_volume: number;
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
    // Workaround for dune indexing issue
    const now = Date.now()
    const tenHoursAgo = now - (10 * 60 * 60 * 1000)
    if ((options.toTimestamp * 1000) > tenHoursAgo) {
        console.log("End timestamp is less than 10 hours ago, skipping fetch due to dune indexing delay", new Date(options.toTimestamp * 1000).toISOString(), new Date(tenHoursAgo).toISOString())
        throw new Error("End timestamp is less than 10 hours ago, skipping due to dune indexing delay")
    }

    const data: IData[] = await queryDuneSql(options, `
        SELECT
            SUM(amount_usd) AS daily_volume
        FROM dex_solana.trades
        WHERE block_time >= from_unixtime(${options.startTimestamp})
            AND block_time <= from_unixtime(${options.endTimestamp})
            AND project = 'raydium_launchlab'
    `)
    const dailyVolume = options.createBalances()
    dailyVolume.addUSDValue(data[0].daily_volume)

    return { dailyVolume }
};

const adapter: SimpleAdapter = {
    fetch,
    chains: [CHAIN.SOLANA],
    start: '2025-04-15',
    dependencies: [Dependencies.DUNE],
    isExpensiveAdapter: true
}

export default adapter
