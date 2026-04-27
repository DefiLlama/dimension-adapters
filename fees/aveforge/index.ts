import {
  Dependencies,
  FetchOptions,
  SimpleAdapter,
} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getETHReceived } from "../../helpers/token";

const FEE_COLLECTOR = "0x4ed28973Bc386655E541864e6964C780b9B92354";

const fetch = async (options: FetchOptions) => {
  const dailyFees = await getETHReceived({
    options,
    target: FEE_COLLECTOR,
  });

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Fees: "Protocol fees collected in ETH and routed to the Aveforge fee collector wallet on MegaETH.",
  Revenue: "All collected fees are retained as protocol revenue.",
  ProtocolRevenue:
    "All collected fees accrue to the protocol-controlled fee collector wallet.",
};

const adapter: SimpleAdapter = {
  version: 2,
  chains: [CHAIN.MEGAETH],
  start: "2026-02-07",
  fetch,
  methodology,
  dependencies: [Dependencies.ALLIUM],
};

export default adapter;
