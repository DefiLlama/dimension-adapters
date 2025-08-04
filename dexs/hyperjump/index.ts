import * as sdk from "@defillama/sdk";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";
import { SimpleAdapter } from "../../adapters/types";

const fetch = univ2Adapter({
  endpoints: {
    [CHAIN.BSC]: sdk.graph.modifyEndpoint('5fWfhux2ZJbU33j7Z1sn6m4vj7N7vapTj9hBKeZ5uyaU'),
  },
  factoriesName: "thugswapFactories",
  dayData: "thugswapDayData",
});

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.BSC]: { fetch, start: 1605139200 },
  },
}

export default adapter;
