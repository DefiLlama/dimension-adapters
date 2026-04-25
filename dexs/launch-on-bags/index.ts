import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSqlFromFile, queryDuneSql } from "../../helpers/dune";

interface IData {
    quote_mint: string;
    daily_volume: string;
}

const fetch = async (options: FetchOptions) => {
    const query = getSqlFromFile('helpers/queries/bags_volume.sql', {
        tx_signer: 'BAGSB9TpGrZxQbEsrEznv5jXXdwyP6AXerN8aVRiAmcv',
        start: options.startTimestamp,
        end: options.endTimestamp,
    });

    const data: IData[] = await queryDuneSql(options, query);
    
    const dailyVolume = options.createBalances();

    data.forEach((row) => {
        dailyVolume.add(row.quote_mint, row.daily_volume);
    });

    return {
        dailyVolume
    };
};

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: false,
    fetch,
    chains: [CHAIN.SOLANA],
    dependencies: [Dependencies.DUNE],
    isExpensiveAdapter: true,
    start: '2025-05-10',
    methodology: {
        Volume: "Trading volume is measured as the raw SOL amount across all DEX trades where a Bags-launched token trades against SOL.",
    },
};

export default adapter;