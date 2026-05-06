import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

const PHOTON_FEE_WALLET = 'AVUCZyuT35YSuj4RH7fwiyPu82Djn2Hfg7y2ND2XcnZH';

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
    const now = Date.now()
    const tenHoursAgo = now - (10 * 60 * 60 * 1000)
    if ((options.toTimestamp * 1000) > tenHoursAgo) {
        throw new Error("End timestamp is less than 10 hours ago, skipping fetch due to dune indexing delay")
    }

    const data = await queryDuneSql(options, `
    SELECT
        COALESCE(SUM(amount_usd), 0) AS daily_volume
    FROM
        dex_solana.trades
    WHERE
        TIME_RANGE
        AND tx_id IN (
            SELECT DISTINCT
                tx_id
            FROM
                solana.account_activity
            WHERE
                address = '${PHOTON_FEE_WALLET}'
                AND TIME_RANGE
        )
    `);

    const dailyVolume = options.createBalances();
    dailyVolume.addUSDValue(data[0].daily_volume);
    return { dailyVolume };
};

const adapter: SimpleAdapter = {
    version: 1,
    adapter: {
        [CHAIN.SOLANA]: {
            fetch,
            start: "2024-01-08",
        },
    },
    dependencies: [Dependencies.DUNE],
    isExpensiveAdapter: true,
};

export default adapter;
