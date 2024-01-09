import { getAdapter } from "../../helpers/aggregators/duneAdapter";

const chains = ["arbitrum", "ethereum", "polygon"];

const adapter = getAdapter(chains, {}, "bebop", 1680307200);

export default adapter;
