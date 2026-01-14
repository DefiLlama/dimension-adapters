import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const BORROWER_OPERATIONS = "0xed35ff90e6593ad71ed15082e24c204c379d3599";

const BorrowingFeePaidEvent = "event BorrowingFeePaid(address indexed borrower, address collateralToken, uint256 amount)";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  const logs = await options.getLogs({
    target: BORROWER_OPERATIONS,
    eventAbi: BorrowingFeePaidEvent,
  });

  logs.forEach((log: any) => {
    dailyFees.add('0xEDB5180661F56077292C92Ab40B1AC57A279a396', log.amount);
  });

  return {
    dailyFees,
    dailyRevenue: dailyFees
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.BERACHAIN]: {
      fetch,
      start: '2025-05-06',
    },
  },
  version: 2,
};

export default adapter;
