import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDune, queryDuneSql } from "../../helpers/dune";

// const queryId = "4900425"; // removed direct query so changes in query don't affect the data, and better visibility

interface IData {
    daily_volume_sol: number;
    daily_protocol_fees_sol: number;
    daily_lp_fees_sol: number;
}

const fetch = async (options) => {
    // https://x.com/pumpdotfun/status/1902762316774486276 source for platform and lp fees brakedown

    const data = await queryDuneSql(options, `
        WITH
            pumpswap_trades AS (
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
                    ) AS protocolFee
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
            )
        SELECT
            SUM(quoteAmountOutorIn / 1e9) AS daily_volume_sol,
            SUM(protocolFee / 1e9) AS daily_protocol_fees_sol,
            SUM(lpFee / 1e9) AS daily_lp_fees_sol
        FROM
            pumpswap_trades
    `)
    const dailyVolume = options.createBalances()
    const dailySupplySideRevenue = options.createBalances()
    const dailyProtocolRevenue = options.createBalances()
    const dailyFees = options.createBalances()

    dailyVolume.addCGToken('solana', data[0].daily_volume_sol)
    dailyProtocolRevenue.addCGToken('solana', data[0].daily_protocol_fees_sol)
    dailySupplySideRevenue.addCGToken('solana', data[0].daily_lp_fees_sol)

    dailyFees.addBalances(dailyProtocolRevenue)
    dailyFees.addBalances(dailySupplySideRevenue)

    // console.log(dailyVolume, dailyFees, dailyUserFees, dailyProtocolRevenue, dailySupplySideRevenue)

    return { 
      dailyVolume, 
      dailyFees,
      dailyRevenue: dailyProtocolRevenue,
      dailyUserFees: dailyFees,
      dailyProtocolRevenue,
      dailySupplySideRevenue
    }
};
  
const adapter: SimpleAdapter = {
    adapter: {
        [CHAIN.SOLANA]: {
            fetch,
            start: '2025-03-15',
            meta: {
                methodology: {
                    Fees: "Total fees collected from all sources, including both LP fees (0.20%) and protocol fees (0.05%) from each trade",
                    Revenue: "Revenue kept by the protocol, which is the 0.05% protocol fee from each trade",
                    SupplySideRevenue: "Value earned by liquidity providers, which is the 0.20% LP fee from each trade",
                    Volume: "Tracks the trading volume across all pairs on PumpFun AMM",
                }
            }
        }
    },
    version: 2,
    isExpensiveAdapter: true
}

export default adapter
