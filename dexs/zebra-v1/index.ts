// https://api.studio.thegraph.com/query/55584/zebra_scroll/0.6.2
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";

const endpoints = {
  [CHAIN.SCROLL]: "https://api.studio.thegraph.com/query/55584/zebra_scroll/0.6.2",
};

const adapter = univ2Adapter(endpoints, {
});

adapter.adapter.scroll.start = 1698364800

export default adapter
