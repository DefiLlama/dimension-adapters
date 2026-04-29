import request, { gql } from "graphql-request";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

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

  const response = await request(endpoint, query);

  let dailyFeesRaw = BigInt(0);
  let dailyRevenueRaw = BigInt(0);

  if (response.position && response.position.length > 0) {
    response.position.forEach((pos: any) => {
      const borrowFee = BigInt(pos.totalBorrowingFeeUsd || "0");
      const totalPosFee = BigInt(pos.totalPositionFeeUsd || "0");
      const posFeeForPool = BigInt(pos.totalPositionFeeUsdForPool || "0");

      dailyFeesRaw += borrowFee + totalPosFee;
      dailyRevenueRaw += totalPosFee - posFeeForPool;
    });
  }

  if (response.swap && response.swap.length > 0) {
    response.swap.forEach((swap: any) => {
      const swapFeeReceiver = BigInt(swap.totalFeeReceiverUsd || "0");
      const swapFeePool = BigInt(swap.totalFeeUsdForPool || "0");

      dailyFeesRaw += swapFeeReceiver + swapFeePool;
      dailyRevenueRaw += swapFeeReceiver;
    });
  }

  const dailyFees = Number(dailyFeesRaw) / 1e30;
  const dailyRevenue = Number(dailyRevenueRaw) / 1e30;

  return {
    timestamp: timestamp,
    dailyFees: dailyFees.toString(),
    dailyRevenue: dailyRevenue.toString(),
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.CELO]: { fetch: fetchFees, start: 1769588096 },
  },
};

export default adapter;
