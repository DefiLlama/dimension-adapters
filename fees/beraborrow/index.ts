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

  // Protocol Fees
  const protocolFeeLogs = await options.getLogs({
    target: "0xb71b3DaEA39012Fb0f2B14D2a9C86da9292fC126",
    eventAbi:
      "event ProtocolFees(address indexed _token, uint256 _amt, uint256 _voterAmt)",
  });

  protocolFeeLogs.forEach((log: any) => {
    dailyFees.add(log._token, log._amt);
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
