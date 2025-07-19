import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { getETHReceived } from "../../helpers/token";

const TOPCUT_VAULT = "0x3cfc3CBA1B4aAF969057F590D23efe46848F4270";
const MARKETS = [
  "0x9A5f16c1f2d6b8c9530144aD23Cfa9B3c4717eF1",
  "0x9681F8EDe1f272F7790AeA193AcbEEf7136CfF17",
  "0x10EF281AAc569Cb011BfcB4e1C6cA490011486a5",
  "0xB8eC8622D8B7924337CA7B143683459fE5a13f79",
  "0xE8B9a818D57E2413E05144311E2d4d190c3f711c",
];

const fetch = async (options: FetchOptions) => {
  // Track 9% of ETH inflows to the vault and all market contracts
  const dailyFees = await getETHReceived({
    options,
    targets: MARKETS,
  });

  const dailyRevenue = await getETHReceived({
    options,
    target: TOPCUT_VAULT,
  });

  return {
    dailyFees: dailyFees.resizeBy(9 / 100), // 9% of all ETH flows into all TopCutMarkets
    dailyRevenue: dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const meta = {
  methodology: {
    Fees: "9% of all ETH flows into all TopCutMarkets",
    Revenue: "All ETH flows into the TopCutVault",
    ProtocolRevenue: "All ETH flows into the TopCutVault",
  },
};


const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch,
      start: '2025-06-16',
      meta,
    },
  },
};

export default adapter;
