import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const endpoints = {
  [CHAIN.BOBA]: "https://api.thegraph.com/subgraphs/name/oolongswap/oolongswap-mainnet",
};

const adapter = univ2Adapter(endpoints, {});

adapter.adapter.boba.start = 1635938988;

export default adapter
