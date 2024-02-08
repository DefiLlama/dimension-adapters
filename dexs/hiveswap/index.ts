import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";

const endpoints = {
  [CHAIN.MAP]: "https://graph.mapprotocol.io/subgraphs/name/hiveswap/exchange-v3-test",
};

const adapter = univ2Adapter(endpoints, {});

adapter.adapter.map.start = async () => 1657929600;

export default adapter
