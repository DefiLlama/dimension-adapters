import request, { gql } from "graphql-request";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { formatUnits } from "ethers";

const endpoint = "https://graph.perpex.ai/celo-beta-usdt-wrap/subgraphs";

const fetchFees = async (timestamp: number) => {
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

  const response = await request(endpoint, query, { timestamp });

  let dailyFeesRaw = BigInt(0);
  let dailyRevenueRaw = BigInt(0);
  let dailySupplySideRevenueRaw = BigInt(0);

  if (response.position && response.position.length > 0) {
    response.position.forEach((pos: any) => {
      const borrowFee = BigInt(pos.totalBorrowingFeeUsd || "0");
      const totalPosFee = BigInt(pos.totalPositionFeeUsd || "0");
      const posFeeForPool = BigInt(pos.totalPositionFeeUsdForPool || "0");

      dailyFeesRaw += borrowFee + totalPosFee;
      dailyRevenueRaw += totalPosFee - posFeeForPool;
      dailySupplySideRevenueRaw += posFeeForPool;
    });
  }

  if (response.swap && response.swap.length > 0) {
    response.swap.forEach((swap: any) => {
      const swapFeeReceiver = BigInt(swap.totalFeeReceiverUsd || "0");
      const swapFeePool = BigInt(swap.totalFeeUsdForPool || "0");

      dailyFeesRaw += swapFeeReceiver + swapFeePool;
      dailyRevenueRaw += swapFeeReceiver;
      dailySupplySideRevenueRaw += swapFeePool;
    });
  }

  const dailyFees = formatUnits(dailyFeesRaw, 30);
  const dailyRevenue = formatUnits(dailyRevenueRaw, 30);
  const dailySupplySideRevenue = formatUnits(dailySupplySideRevenueRaw, 30);

  return {
    timestamp: timestamp,
    dailyFees: dailyFees,
    dailyRevenue: dailyRevenue,
    dailySupplySideRevenue: dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  methodology: {
    dailyFees: "Position borrowing/position fees and swap fees.",
    dailyRevenue: "Protocol-retained portion after pool allocations.",
    dailySupplySideRevenue: "Pool-side fee allocations."
  },
  breakdownMethodology: {
    dailyFees: { position: "Borrowing + position fees", swap: "Receiver + pool swap fees" },
    dailyRevenue: { position: "Position fees net of pool share", swap: "Receiver share" },
    ailySupplySideRevenue: { positionPool: "Position fee share to pool", swapPool: "Swap fee share to pool" }
  },
  adapter: {
    [CHAIN.CELO]: { fetch: fetchFees, start: 1769588096 },
  },
};

export default adapter;
