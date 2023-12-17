import { getAdapter } from "../../helpers/aggregators/duneAdapter";
import { CHAIN } from "../../helpers/chains";

const chains = [
  "arbitrum",
  "avalanche_c",
  "bnb",
  "celo",
  "ethereum",
  "fantom",
  "optimism",
  "polygon",
  "base",
];

const chainsMap: Record<string, string> = {
  [CHAIN.BSC]: "bnb",
  [CHAIN.AVAX]: "avalanche_c",
};

const adapter = getAdapter(chains, chainsMap, "0x API", 1671062400);

export default adapter;
