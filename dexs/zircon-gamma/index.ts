import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";

const endpoints = {
  [CHAIN.MOONRIVER]: "https://api.thegraph.com/subgraphs/name/reshyresh/zircon-alpha",
};

const adapter = univ2Adapter(endpoints, {});

adapter.adapter.moonriver.start = 1663200000;

export default adapter
