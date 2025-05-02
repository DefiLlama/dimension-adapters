// Fee Source : https://docs.boop.fun/token-deployment-101

import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { FetchOptions } from "../../adapters/types";

interface IData {
    total_volume: number;
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
    const data: IData[] = await queryDuneSql(options, `
        WITH boop_txs AS (
            SELECT
                CASE
                    WHEN VARBINARY_STARTS_WITH (data, 0x8a7f0e5b26577369) THEN BYTEARRAY_TO_UINT256 (BYTEARRAY_REVERSE (BYTEARRAY_SUBSTRING (data, 9, 8)))
                    WHEN VARBINARY_STARTS_WITH (data, 0x6d3d28bbe6b087ae) THEN BYTEARRAY_TO_UINT256 (BYTEARRAY_REVERSE (BYTEARRAY_SUBSTRING (data, 17, 8)))
                END AS amount
            FROM
                solana.instruction_calls
            WHERE
                tx_success = TRUE
                AND inner_executing_account = 'boop8hVGQGqehUK2iVEMEnMrL5RbjywRzHKBmBE7ry4'
                AND (
                    VARBINARY_STARTS_WITH (data, 0x8a7f0e5b26577369)
                    OR VARBINARY_STARTS_WITH (data, 0x6d3d28bbe6b087ae)
                )
                AND TIME_RANGE
        )
        SELECT
            SUM(amount) / 1e9 AS total_volume
        FROM boop_txs
    `)
    const dailyVolumeSOL = data[0].total_volume;
    const dailyFees = options.createBalances();
    dailyFees.addCGToken('solana', dailyVolumeSOL * 0.01);
    const dailyHoldersRevenue = dailyFees.clone(0.9);
    const dailyProtocolRevenue = dailyFees.clone(0.1);

    return {
        dailyFees,
        dailyUserFees: dailyFees,
        dailyRevenue: dailyFees,
        dailyProtocolRevenue,
        dailyHoldersRevenue
    };
};

const adapter: SimpleAdapter = {
    adapter: {
        [CHAIN.SOLANA]: {
            fetch,
            start: '2025-05-01',
            meta: {
                methodology: {
                    fees: '1% fee on all buy/sell transactions, calculated on SOL volume.',
                    revenue: 'holdersRevenue + protocolRevenue',
                    holdersRevenue: '30% fee goes to Boop Buyback bank, 60% goes to stakers',
                    protocolRevenue: '10% of the 1% transaction fee goes to the protocol.'
                }
            }
        }
    },
    version: 1,
    isExpensiveAdapter: true
}

export default adapter
