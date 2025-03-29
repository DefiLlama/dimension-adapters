import { ChainBlocks, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const fetchFees = async (
  timestamp: number,
  _: ChainBlocks,
  options: FetchOptions
) => {
  const dailyFees = options.createBalances();

  console.log(dailyFees);
  // Performance Fees
  const performanceFeeLogs = await options.getLogs({
    target: "0xdb32ca8f3bb099a76d4ec713a2c2aacb3d8e84b9",
    eventAbi:
      "event PerformanceFee (index_topic_1 address token, uint256 amount)",
  });

  console.log("Performance Fee Logs", performanceFeeLogs);
  // Process performance fees
  performanceFeeLogs.forEach((log: any) => {
    dailyFees.add(log.token, log.amount);
  });

  // Protocol Fees
  const protocolFeeLogs = await options.getLogs({
    target: "0xb71b3daea39012fb0f2b14d2a9c86da9292fc126",
    eventAbi:
      "event ProtocolFees (index_topic_1 address _token, uint256 _amt, uint256 _voterAmt)",
  });

  // Process protocol fees
  protocolFeeLogs.forEach((log: any) => {
    dailyFees.add(log._token, log._amt);
  });

  return {
    timestamp,
    dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BERACHAIN]: {
      fetch: fetchFees,
      start: "2023-09-16", // Block number from which data can be fetched
    },
  },
};

export default adapter;
