import request, { gql } from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const endpoint = "https://graph.perpex.ai/celo-beta-usdt-wrap/subgraphs";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
    const query = gql`
    query TestDailyFees {
      position: positionFeesInfoWithPeriods(
        where: { period: "1d" }
        orderBy: id
        orderDirection: desc
        first: 1
      ) {
        totalBorrowingFeeUsd
        totalPositionFeeUsd
        totalPositionFeeUsdForPool
      }

      swap: swapFeesInfoWithPeriods(
        where: { period: "1d" }
        orderBy: id
        orderDirection: desc
        first: 1
      ) {
        totalFeeReceiverUsd
        totalFeeUsdForPool
      }
    }
  `;

    const response = await request(endpoint, query);

    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    if (response.position && response.position.length > 0) {
        response.position.forEach((pos: any) => {
            const borrowFee = BigInt(pos.totalBorrowingFeeUsd || "0");
            const totalPosFee = BigInt(pos.totalPositionFeeUsd || "0");
            const posFeeForPool = BigInt(pos.totalPositionFeeUsdForPool || "0");

            dailyFees.addUSDValue(borrowFee / BigInt(1e30), 'Borrow Fees')
            dailySupplySideRevenue.addUSDValue(borrowFee / BigInt(1e30), 'Borrow Fee to LPs')

            dailyFees.addUSDValue(totalPosFee / BigInt(1e30), 'Position Fee')
            dailyRevenue.addUSDValue(totalPosFee / BigInt(1e30) - posFeeForPool / BigInt(1e30), 'Position Fee to protocol')
            dailySupplySideRevenue.addUSDValue(posFeeForPool / BigInt(1e30), 'Position Fee to LPs')
        });
    }

    if (response.swap && response.swap.length > 0) {
        response.swap.forEach((swap: any) => {
            const swapFeeReceiver = BigInt(swap.totalFeeReceiverUsd || "0");
            const swapFeePool = BigInt(swap.totalFeeUsdForPool || "0");

            dailyFees.addUSDValue(swapFeeReceiver / BigInt(1e30), METRIC.SWAP_FEES)
            dailyRevenue.addUSDValue(swapFeeReceiver / BigInt(1e30), 'Swap fees to protocol')

            dailyFees.addUSDValue(swapFeePool / BigInt(1e30), METRIC.SWAP_FEES)
            dailySupplySideRevenue.addUSDValue(swapFeePool / BigInt(1e30), 'Swap fees to LPs')
        });
    }

    return {
        dailyFees,
        dailyRevenue,
        dailySupplySideRevenue,
    };
};

const methodology = {
    Fees: "Position borrowing/position fees and swap fees.",
    Revenue: "Protocol-retained portion after pool allocations.",
    SupplySideRevenue: "Pool-side fee allocations."
}

const breakdownMethodology = {
    Fees:
    {
        [METRIC.SWAP_FEES]: "Total swap fees paid by users",
        'Borrow Fees': "Total borrowing fees paid by users",
        'Position Fee': "Total position fees paid by users",
    },
    Revenue:
    {
        'Position Fee to protocol': "Protocol share of position fees",
        'Swap fees to protocol': "Protocol share of swap fees"
    },
    ProtocolRevenue:
    {
        'Position Fee to protocol': "Protocol share of position fees",
        'Swap fees to protocol': "Protocol share of swap fees"
    },
    SupplySideRevenue:
    {
        'Position Fee to LPs': "Position fee share to pool",
        'Swap fees to LPs': "Swap fee share to pool",
        'Borrow Fee to LPs': "Borrow fee share to pool",
    }
}

const adapter: SimpleAdapter = {
    fetch,
    chains: [CHAIN.CELO],
    runAtCurrTime: true,
    methodology,
    breakdownMethodology,
};

export default adapter;
