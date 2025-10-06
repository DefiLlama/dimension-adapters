import { FetchOptions, SimpleAdapter } from "../../adapters/types.ts";
import { CHAIN } from "../../helpers/chains.ts";

const FeeCollectedEvent =
  "event SafeReceived(address indexed sender, uint256 value)";
// multi-sig aspecta uses to collect the 2.5% fee on buildkey trades
const AESPECTAFeeCollector = "0x38799Ce388a9b65EC6bA7A47c1efb9cF1A7068e4";

const fetch: any = async (options: FetchOptions) => {
  let totalFeesCollected: bigint = BigInt(0);

  const dailyFees = options.createBalances();
  const data: any[] = await options.getLogs({
    target: AESPECTAFeeCollector,
    eventAbi: FeeCollectedEvent,
  });

  // fee for each buildkey trade is in BNB, so we sum them up
  data.forEach((log: any) => {
    totalFeesCollected += log.value;
  });

  // Adding fees collected in BNB
  dailyFees.addGasToken(totalFeesCollected);

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BSC]: {
      fetch: fetch,
    },
  },
  methodology: {
    Fees: "Buildkey tokens trading fees paid by users.",
    Revenue: "All fees are revenue.",
    ProtocolRevenue: "All revenue collected by protocol.",
  },
};

export default adapter;
