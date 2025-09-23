import ADDRESSES from '../../helpers/coreAssets.json'
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { FetchOptions } from "../../adapters/types";

// const queryId = "4900425"; // removed direct query so changes in query don't affect the data, and better visibility

interface IData {
    quoteAmountOutorIn: number;
    lpFee: number;
    protocolFee: number;
    coinCreatorFee: number;
    quoteMint: string;
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
    const data: IData[] = await queryDuneSql(options, `WITH
        decoded_pool AS (
            SELECT
                to_base58 (bytearray_substring (data, 182, 32)) AS pool,
                to_base58 (bytearray_substring (data, 91, 32)) AS quoteMint
            FROM
                solana.instruction_calls
            WHERE
                varbinary_starts_with (data, 0xe445a52e51cb9a1db1310cd2a076a774)
                AND executing_account = 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA'
        ),
        decoded_swap AS (
            SELECT
                tx_id,
                block_time,
                BYTEARRAY_TO_UINT256 (
                    BYTEARRAY_REVERSE (BYTEARRAY_SUBSTRING (data, 73, 8))
                ) AS quoteAmountOutorIn,
                BYTEARRAY_TO_UINT256 (
                    BYTEARRAY_REVERSE (BYTEARRAY_SUBSTRING (data, 89, 8))
                ) AS lpFee,
                BYTEARRAY_TO_UINT256 (
                    BYTEARRAY_REVERSE (BYTEARRAY_SUBSTRING (data, 105, 8))
                ) AS protocolFee,
                COALESCE(CASE WHEN BYTEARRAY_LENGTH(data) >= 368 THEN BYTEARRAY_TO_UINT256(BYTEARRAY_REVERSE(BYTEARRAY_SUBSTRING(data, 361, 8))) ELSE 0 END, 0) AS coinCreatorFee,
                to_base58 (bytearray_substring (data, 129, 32)) AS pool
            FROM
                solana.instruction_calls
            WHERE
                tx_success = TRUE
                AND inner_executing_account = 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA'
                AND (
                    VARBINARY_STARTS_WITH (data, 0xe445a52e51cb9a1d3e2f370aa503dc2a)
                    OR VARBINARY_STARTS_WITH (data, 0xe445a52e51cb9a1d67f4521f2cf57777)
                )
                AND TIME_RANGE
        ),
        pumpswap_trades AS (
            SELECT
                s.block_time,
                DATE_TRUNC('day', s.block_time) AS dt,
                s.quoteAmountOutorIn,
                p.quoteMint,
                s.protocolFee,
                s.lpFee,
                s.coinCreatorFee
            FROM
                decoded_swap s
                JOIN decoded_pool p ON s.pool = p.pool
            WHERE
                s.block_time >= TIMESTAMP '2025-03-15'
                AND p.quoteMint IN (
                    '${ADDRESSES.solana.SOL}',
                    'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So',
                    '${ADDRESSES.solana.USDC}',
                    '${ADDRESSES.solana.USDT}',
                    'DEkqHyPN7GMRJ5cArtQFAWefqbZb33Hyf6s5iCwjEonT'
                )
                AND TIME_RANGE
        )
        SELECT
            quoteMint,
            SUM(quoteAmountOutorIn) AS quoteAmountOutorIn,
            SUM(protocolFee) as protocolFee,
            SUM(lpFee) as lpFee,
            SUM(coinCreatorFee) as coinCreatorFee
        FROM
            pumpswap_trades
        WHERE
            quoteAmountOutorIn IS NOT NULL
        GROUP BY
            quoteMint
    `)
    const dailySupplySideRevenue = options.createBalances()
    const dailyProtocolRevenue = options.createBalances()
    const dailyFees = options.createBalances()
    const dailyCoinCreatorRevenue = options.createBalances();

    for (const item of data) {
        dailyProtocolRevenue.add(item.quoteMint, item.protocolFee, 'ProtocolFees')
        dailySupplySideRevenue.add(item.quoteMint, item.lpFee, 'DexLPFees')
        dailyCoinCreatorRevenue.add(item.quoteMint, item.coinCreatorFee || 0, 'DexCreatorFees');
    }
    dailyFees.addBalances(dailyProtocolRevenue, 'ProtocolFees');
    dailyFees.addBalances(dailySupplySideRevenue, 'DexLPFees');
    dailyFees.addBalances(dailyCoinCreatorRevenue, 'DexCreatorFees');
    dailySupplySideRevenue.addBalances(dailyCoinCreatorRevenue, 'DexCreatorFees');

    return {
        dailyFees,
        dailyRevenue: dailyProtocolRevenue,
        dailyUserFees: dailyFees,
        dailyProtocolRevenue,
        dailySupplySideRevenue,
        dailyHoldersRevenue: 0, // buybacks are tracked in pump fun launchpad
    }
};

const breakdownMethodology = {
    Fees: {
        'ProtocolFees': 'Trade fees from PumpFun AMM that goes to the protocol',
        'DexLPFees': 'Trade fees from PumpFun AMM that goes to liquidity providers',
        'DexCreatorFees': 'Trade fees from PumpFun AMM that goes to coin creators',
    },
    Revenue: {
        'ProtocolFees': 'Trade fees from PumpFun AMM that goes to the protocol',
    },
    SupplySideRevenue: {
        'DexLPFees': 'Trade fees from PumpFun AMM that goes to liquidity providers',
        'DexCreatorFees': 'Trade fees from PumpFun AMM that goes to coin creators',
    },
}

const adapter: SimpleAdapter = {
    breakdownMethodology,
    adapter: {
        [CHAIN.SOLANA]: {
            fetch,
            start: '2025-02-20',
        }
    },
    methodology: {
        Fees: "Total fees collected from all sources, including LP fees (0.20%) and protocol fees (0.05%) and coin creator fees (0.05%) from each trade",
        Revenue: "Revenue kept by the protocol, which is the 0.05% protocol fee from each trade",
        SupplySideRevenue: "Value earned by liquidity providers, which is the 0.20% LP fee from each trade",
        Volume: "Tracks the trading volume across all pairs on PumpFun AMM",
    },
    version: 1,
    isExpensiveAdapter: true
}

export default adapter
