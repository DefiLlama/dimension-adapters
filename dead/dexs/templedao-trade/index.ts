import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const adapter: SimpleAdapter = {
  version: 2,
  deadFrom: '2023-10-01',
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: () => ({} as any),
      start: '2022-10-01',
    }
  }
};

export default adapter;
