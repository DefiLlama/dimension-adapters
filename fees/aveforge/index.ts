import {
  Dependencies,
  FetchOptions,
  SimpleAdapter,
} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getETHReceived } from "../../helpers/token";

const MARKETPLACE_FEE_COLLECTOR = "0x4ed28973Bc386655E541864e6964C780b9B92354";
const GAME_TREASURY = "0xb12e49a4CDB83eac29C759ffC64DF818fBa8e28b";

const fetch = async (options: FetchOptions) => {
  const dailyFees = await getETHReceived({
    options,
    targets: [MARKETPLACE_FEE_COLLECTOR, GAME_TREASURY],
  });

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Fees: "Protocol fees collected in ETH on MegaETH: marketplace fees routed to the Aveforge fee collector wallet plus in-game transaction fees (store purchases, etc.) routed to the game treasury wallet.",
  Revenue: "All collected fees are retained as protocol revenue.",
  ProtocolRevenue:
    "All collected fees accrue to protocol-controlled wallets (marketplace fee collector and game treasury).",
};

const breakdownMethodology = {
  trading_fees: "User-paid game transaction fees collected in ETH on MegaETH.",
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.MEGAETH],
  start: "2026-02-07",
  fetch,
  methodology,
  breakdownMethodology,
  dependencies: [Dependencies.ALLIUM],
};

export default adapter;
