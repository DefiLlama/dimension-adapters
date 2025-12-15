import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const ClaimedEvent = "event Claimed(uint256 indexed amount)";
// BridgeInterestReceiver Contract
const contract = "0x670daeaf0f1a5e336090504c68179670b5059088";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  const data: any[] = await options.getLogs({
    target: contract,
    eventAbi: ClaimedEvent,
  });
  data.forEach((log: any) => {
    dailyFees.addGasToken(log.amount);
  });

  return {
    dailyFees: dailyFees,
    dailyRevenue: 0,
    dailySupplySideRevenue: dailyFees,

  };
};

const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    Fees: 'Yield generated from MakerDAO DSR on bridged assets',
    SupplySideRevenue: 'Total yield is distributed to sDAI holders',
  },
  fetch,
  adapter: {
    [CHAIN.XDAI]: {
      start: "2023-09-28",
    },
  },
};

export default adapter;
