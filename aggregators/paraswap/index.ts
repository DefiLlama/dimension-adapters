import { getAdapter } from "../../helpers/aggregators/duneAdapter";
import { CHAIN } from "../../helpers/chains";

const chains = [
  "arbitrum",
  "avax",
  "bsc",
  "ethereum",
  "fantom",
  "optimism",
  "polygon",
];

const chainMap: Record<string, string> = {
  [CHAIN.BSC]: "bnb",
  [CHAIN.AVAX]: "avalanche_c",
};
const adapter = getAdapter(chains, chainMap, "paraswap", 1676592000);

export default adapter;
