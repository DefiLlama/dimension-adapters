import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getETHReceived } from "../../helpers/token";

const fetchFees = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  // Performance Fees
  const performanceFeeLogs = await options.getLogs({
    target: "0xe59ab0c3788217e48399dae3cd11929789e4d3b2",
    eventAbi: "event PerformanceFee(address indexed token, uint256 amount)",
  });

  performanceFeeLogs.forEach((log: any) => {
    dailyFees.add(log.token, log.amount);
  });

  // Borrowing Fee

  const borrowingFeePaid = await options.getLogs({
    target: "0xdb32ca8f3bb099a76d4ec713a2c2aacb3d8e84b9",
    eventAbi: `event BorrowingFeePaid(address indexed name, address indexed borrower, uint256 amount)`,
  });

  const debtTokens = await options.api.multiCall({
    abi: "address:debtToken",
    calls: borrowingFeePaid.map((log: any) => ({ target: log.name })),
  });

  borrowingFeePaid.forEach((log: any, i: number) => {
    const token = debtTokens[i];
    dailyFees.add(token, log.amount);
  });

  return { dailyFees };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BERACHAIN]: {
      fetch: fetchFees,
      start: "2025-02-14",
    },
  },
};

export default adapter;
