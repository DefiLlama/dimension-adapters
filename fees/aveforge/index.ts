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
  const dailyFees = options.createBalances();

  const marketplaceFees = await getETHReceived({
    options,
    target: MARKETPLACE_FEE_COLLECTOR,
  });
  const gameFees = await getETHReceived({
    options,
    target: GAME_TREASURY,
  });

  dailyFees.add(marketplaceFees, 'Marketplace Trading Fees');
  dailyFees.add(gameFees, 'In-Game Services Fees');

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Fees: "Protocol fees collected in ETH on MegaETH: marketplace fees routed to the Aveforge fee collector wallet plus in-game transaction fees (store purchases, etc.) routed to the game treasury wallet.",
  Revenue:
    "All collected fees retained by the protocol-controlled wallets are counted as protocol revenue.",
  ProtocolRevenue:
    "All collected fees accrue to protocol-controlled wallets (marketplace fee collector and game treasury).",
};

const breakdownMethodology = {
  Fees: {
    'Marketplace Trading Fees': "Marketplace fees collected in ETH and routed to the Aveforge fee collector wallet on MegaETH.",
    'In-Game Services Fees': "In-game transaction fees (store purchases, etc.) collected in MegaETH and routed to the game treasury wallet.",
  },
  Revenue: {
    'Marketplace Trading Fees': "Marketplace fees retained by the protocol fee collector wallet.",
    'In-Game Services Fees': "In-game fees retained by the protocol game treasury wallet.",
  },
  ProtocolRevenue: {
    'Marketplace Trading Fees': "Marketplace fees accruing to the protocol-controlled fee collector wallet.",
    'In-Game Services Fees': "In-game fees accruing to the protocol-controlled game treasury wallet.",
  },
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
