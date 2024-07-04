import * as sdk from "@defillama/sdk";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";

const endpoints = {
  [CHAIN.BSC]: sdk.graph.modifyEndpoint('5fWfhux2ZJbU33j7Z1sn6m4vj7N7vapTj9hBKeZ5uyaU'),
};

const adapter = univ2Adapter(endpoints, {
  factoriesName: "thugswapFactories",
  dayData: "thugswapDayData",
});

adapter.adapter.bsc.start = 1605139200;

export default adapter
