import { getAdapter } from "../../helpers/aggregators/duneAdapter";
import { CHAIN } from "../../helpers/chains";

const chains = ["arbitrum", "bsc", "ethereum", "optimism", "polygon", "base"];
const chainMap = { [CHAIN.BSC]: "bnb" };
const adapter = getAdapter(chains, chainMap, "DODO X", 1676592000);

export default adapter;
