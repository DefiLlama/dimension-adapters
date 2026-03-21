import { Adapter, FetchOptions, FetchResult } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getAdaReceived } from "../../helpers/cardano";

const FEE_ADDRESS = "addr1q9l5h04ydyshk0gldynujplszzqlmmc2ttcfv7jqyfpmfxvdylytgqqs2x7fnewypjjxk8k8dg7ww2j8a8dtp50dwrmqqqspxm";

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const dailyFees = options.createBalances();

  const adaReceived = await getAdaReceived(
    options.startTimestamp,
    options.endTimestamp,
    FEE_ADDRESS
  );

  dailyFees.addCGToken("cardano", adaReceived);

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const adapter: Adapter = {
  version: 2,
  fetch,
  chains: [CHAIN.CARDANO],
  start: '2025-08-13',
  allowNegativeValue: false,
  methodology: {
    Fees: "Aggregator service fees paid by users.",
    Revenue: "All aggregator service fees collected by the protocol.",
    ProtocolRevenue: "Total ADA received by the protocol fee address within the day.",
  },
};

export default adapter;
