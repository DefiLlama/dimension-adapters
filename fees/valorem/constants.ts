import { ChainEndpoints } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

export const endpoints: ChainEndpoints = {
  [CHAIN.ARBITRUM]:
    "https://api.thegraph.com/subgraphs/name/valorem-labs-inc/valorem-v1-arbitrum",
};

export const methodology = {
  Fees: "All fees come from users of Valorem Protocol.",
  UserFees: "Valorem collects fees when users write and exercise options.",
  Revenue: "All revenue generated comes from user fees.",
  ProtocolRevenue:
    "Valorem collects fees when users write and exercise options.",
  HoldersRevenue: "Valorem has no governance token.",
  SupplySideRevenue: "Valorem has no LPs.",
  NotionalVolume:
    "Notional Volume is calculated with the market value of the Underlying + Exercise assets of a position at the time of Write/Exercise/Redeem/Transfer.",
  PremiumVolume:
    "Premium Volume is calculated with the market price an Option/Claim position is trading for on the Exchange.",
};

export const OSE_DEPLOY_TIMESTAMP_BY_CHAIN = {
  [CHAIN.ARBITRUM]: 1693526399,
};
