import { getAdapter } from "../../helpers/aggregators/duneAdapter";
import { CHAIN } from "../../helpers/chains";

const adapter = getAdapter([CHAIN.ETHEREUM], {}, "tokenlon", 1676592000);

export default adapter;
