import { Adapter, FetchOptions, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getETHReceived } from "../helpers/token";

const PROTOCOL_FEE_LABEL = "Protocol fees";
const FEE_RECIPIENT = '0xb16c1342E617A5B6E4b631EB114483FDB289c0A4';

const fetch = async (options: FetchOptions): Promise<FetchResultFees> => {
  const dailyFees = options.createBalances();
  const fees = await getETHReceived({ options, target: FEE_RECIPIENT });
  dailyFees.addBalances(fees, PROTOCOL_FEE_LABEL);
  return { dailyFees, dailyRevenue: dailyFees, }
}

const methodology = {
  Fees: "Protocol fees collected on NFT trades through sudoswap AMM pools",
  Revenue: "All protocol fees are retained by sudoswap"
}

const breakdownMethodology = {
  Fees: {
    [PROTOCOL_FEE_LABEL]: "Protocol fees charged on NFT trades executed through sudoswap's automated market maker pools"
  },
  Revenue: {
    [PROTOCOL_FEE_LABEL]: "All protocol fees from NFT trades are retained by the sudoswap protocol"
  }
}

const adapter: Adapter = {
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: '2023-01-01',
  methodology,
  breakdownMethodology
};

export default adapter;
