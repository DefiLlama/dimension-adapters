import { Dependencies, FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from '../../helpers/dune';
import { METRIC } from "../../helpers/metrics";

const ABIs = {
    claimYield: "event ClaimYield (address indexed user, uint256 amount)",
    withdrawRequest: "event WithdrawRequest (address indexed user, uint256 amount, uint256 id)"
}

const STANDX_GATEWAY: any = {
    [CHAIN.SOLANA]: 'STANDuMpNNVwurxY9WdaDD4Ngo192Bngyi4Ne62Re4D',
    [CHAIN.BSC]: '0x00b4F9B510893505aceFB10eC91cBC972185088e'
};

async function fetchSol(_a: any, _b: any, options: FetchOptions): Promise<FetchResult> {
    const dailyFees = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();
    const dailyRevenue = options.createBalances();

    const duneQuery = `
        SELECT 
            COALESCE(SUM(CASE WHEN bytearray_substring(data, 1, 8) = 0x314a6f07ba163da5 THEN 
        bytearray_to_uint256(bytearray_reverse(bytearray_substring(data, 9, 8))) / 1e6 
    END), 0) AS total_yield,
        COALESCE(SUM(CASE WHEN bytearray_substring(data, 1, 8) = 0x054d7820028fd610 THEN 
        bytearray_to_uint256(bytearray_reverse(bytearray_substring(data, 9, 8))) / 1e6 * 0.001 
    END), 0) AS total_withdrawal_fees
    
    FROM solana.instruction_calls 
    WHERE executing_account = '${STANDX_GATEWAY[options.chain]}' 
        AND (
        bytearray_substring(data, 1, 8) = 0x314a6f07ba163da5
        OR bytearray_substring(data, 1, 8) = 0x054d7820028fd610
    )
    AND TIME_RANGE
    `

    const queryResults = await queryDuneSql(options, duneQuery);

    dailyFees.addUSDValue(queryResults[0].total_yield, METRIC.ASSETS_YIELDS);
    dailySupplySideRevenue.addUSDValue(queryResults[0].total_yield, METRIC.ASSETS_YIELDS);

    dailyFees.addUSDValue(queryResults[0].total_withdrawal_fees, METRIC.DEPOSIT_WITHDRAW_FEES);
    dailyRevenue.addUSDValue(queryResults[0].total_withdrawal_fees, METRIC.DEPOSIT_WITHDRAW_FEES);

    return {
        dailyFees,
        dailyRevenue,
        dailySupplySideRevenue,
        dailyProtocolRevenue: dailyRevenue
    }
}

async function fetch(_a: any, _b: any, options: FetchOptions): Promise<FetchResult> {
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    const yieldClaimLogs = await options.getLogs({
        target: STANDX_GATEWAY[options.chain],
        eventAbi: ABIs.claimYield
    });

    const withdrawRequestLogs = await options.getLogs({
        target: STANDX_GATEWAY[options.chain],
        eventAbi: ABIs.withdrawRequest
    });

    yieldClaimLogs.forEach(claim => {
        dailyFees.addUSDValue(Number(claim.amount) / 1e6, METRIC.ASSETS_YIELDS);
        dailySupplySideRevenue.addUSDValue(Number(claim.amount) / 1e6, METRIC.ASSETS_YIELDS);
    });

    withdrawRequestLogs.forEach(request => {
        dailyFees.addUSDValue((Number(request.amount) / 1e6) * (0.1 / 100), METRIC.DEPOSIT_WITHDRAW_FEES);
        dailyRevenue.addUSDValue((Number(request.amount) / 1e6) * (0.1 / 100), METRIC.DEPOSIT_WITHDRAW_FEES);
    });

    return {
        dailyFees,
        dailyRevenue,
        dailySupplySideRevenue,
        dailyProtocolRevenue: dailyRevenue
    }
}

const methodology = {
    Fees: "Includes yields received by DUSD holders in standx( via: Staking reward of ETH, SOL or any other assets, 2 Funding fee revenue) and 0.1% withdrawal fees",
    Revenue: "0.1% withdrawal fees of DUSD",
    SupplySideRevenue: "Yields distributed to DUSD holders(stablecoin suppliers)",
    ProtocolRevenue: "0.1% withdrawal fees going to protocol treasury"
};

const breakdownMethodology = {
    Fees: {
        [METRIC.ASSETS_YIELDS]: "Yields received by DUSD holders in standx( via: Staking reward of ETH, SOL or any other assets)",
        [METRIC.DEPOSIT_WITHDRAW_FEES]: "0.1% DUSD withdrawal fees"
    }
}

const adapter: SimpleAdapter = {
    fetch,
    methodology,
    breakdownMethodology,
    adapter: {
        [CHAIN.BSC]: {
            fetch,
            start: '2025-03-14'
        },
        [CHAIN.SOLANA]: {
            fetch: fetchSol,
            start: '2025-02-19'
        }
    },
    isExpensiveAdapter: true,
    dependencies: [Dependencies.DUNE],
}

export default adapter;