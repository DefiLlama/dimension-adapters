import ADDRESSES from '../../helpers/coreAssets.json'
import { Dependencies, SimpleAdapter } from "../../adapters/types";
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
    const data: IData[] = await queryDuneSql(options, `
        WITH pools AS (
            SELECT
                pool,
                quote_mint AS quoteMint
            FROM
                pumpdotfun_solana.pump_amm_evt_createpoolevent
        ),
        sells AS (
            SELECT
                quote_amount_out AS amount,
                lp_fee,
                protocol_fee,
                coin_creator_fee,
                pool
            FROM
                pumpdotfun_solana.pump_amm_evt_sellevent
            WHERE
                evt_block_time >= from_unixtime(${options.startTimestamp}) AND evt_block_time < from_unixtime(${options.endTimestamp})
        ),
        buys AS (
            SELECT
                quote_amount_in AS amount,
                lp_fee,
                protocol_fee,
                coin_creator_fee,
                pool
            FROM
                pumpdotfun_solana.pump_amm_evt_buyevent
            WHERE
                evt_block_time >= from_unixtime(${options.startTimestamp}) AND evt_block_time < from_unixtime(${options.endTimestamp})
        ),
        pumpswap_trades AS (
            SELECT
                p.quoteMint,
                s.amount,
                s.protocol_fee AS protocolFee,
                s.lp_fee AS lpFee,
                s.coin_creator_fee AS coinCreatorFee
            FROM
                (SELECT * FROM buys UNION ALL SELECT * FROM sells) s
                JOIN pools p ON s.pool = p.pool
            WHERE
                p.quoteMint IN (
                    '${ADDRESSES.solana.SOL}',
                    'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So',
                    '${ADDRESSES.solana.USDC}',
                    '${ADDRESSES.solana.USDT}',
                    '${ADDRESSES.solana.PUMP}',
                    'DEkqHyPN7GMRJ5cArtQFAWefqbZb33Hyf6s5iCwjEonT'
                )
        )
        SELECT
            quoteMint,
            SUM(amount) AS quoteAmountOutorIn,
            SUM(protocolFee) AS protocolFee,
            SUM(lpFee) AS lpFee,
            SUM(coinCreatorFee) AS coinCreatorFee
        FROM
            pumpswap_trades
        WHERE
            amount IS NOT NULL
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
    version: 1,
    fetch,
    chains: [CHAIN.SOLANA],
    dependencies: [Dependencies.DUNE],
    start: '2025-02-20',
    breakdownMethodology,
    methodology: {
        Fees: "Total fees collected from all sources, including LP fees (0.20%) and protocol fees (0.05%) and coin creator fees (0.05%) from each trade",
        Revenue: "Revenue kept by the protocol, which is the 0.05% protocol fee from each trade",
        SupplySideRevenue: "Value earned by liquidity providers, which is the 0.20% LP fee from each trade",
        Volume: "Tracks the trading volume across all pairs on PumpFun AMM",
    },
    isExpensiveAdapter: true
}

export default adapter
