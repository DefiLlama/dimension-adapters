import { FetchOptions, SimpleAdapter } from "../../adapters/types.ts";
import { CHAIN } from "../../helpers/chains.ts";

// multi-sig aspecta uses to collect the 2.5% fee on buildkey trades
// ref: https://docs.aspecta.ai/buildkey/fees-and-benefits
// determined the contract address by looking at buildkey buy/sell txns and looking at the value split
// ex txn of a SONEX build key trade - https://bscscan.com/tx/0x67c3e2c4ca0588a8dd9cdcd1a0448754847665e78b083f3b7dd5dfdda5f10cea
const AESPECTAFeeCollector = "0x38799Ce388a9b65EC6bA7A47c1efb9cF1A7068e4";
const FeeCollectedEvent = "event SafeReceived(address indexed sender, uint256 value)";

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
    Revenue: "All buildkey tokens trading fees paid by users are revenue.",
    ProtocolRevenue: "All buildkey tokens trading fees collected by protocol.",
  },
};

export default adapter;
