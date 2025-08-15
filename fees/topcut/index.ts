import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { getETHReceived } from "../../helpers/token";

const TOPCUT_VAULT = "0x3cfc3CBA1B4aAF969057F590D23efe46848F4270";

const fetch = async (options: FetchOptions) => {

  // 5% of ETH inflows to TopCut Markets go to the Vault (revenue)
  // 9% of ETH inflows to TopCut Markets is the total fee burden to users
  // 9% / 5% = 1.8 --> factor applied to ETH inflows to Vault to get Total Fees
  const dailyRevenue = await getETHReceived({
    options,
    target: TOPCUT_VAULT,
  });

  return {
    dailyFees: dailyRevenue.resizeBy(9 / 5), // 9% total fees, 5% revenue -> Fees = 1.8 * revenue
    dailyRevenue: dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const methodology = {
  Fees: "9% of all ETH flows into active TopCutMarkets, i.e. 1.8 times the protocol revenue.",
  Revenue: "All ETH flows into the TopCutVault. Equals 5% of all ETH flow into TopCutMarkets.",
  ProtocolRevenue: "All ETH flows into the TopCutVault",
};


const adapter: SimpleAdapter = {
  methodology,
  version: 2,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch,
      start: '2025-06-16',
    },
  },
};

export default adapter;
