import { CHAIN } from "../../helpers/chains";
import { SimpleAdapter } from "../../adapters/types";
import { getUniV2LogAdapter } from "../../helpers/uniswap";

const adapter: SimpleAdapter = {
  deadFrom: '2026-01-15',
  version: 2,
  adapter: {
    [CHAIN.KARDIA]: { fetch: getUniV2LogAdapter({ factory: '0x64203f29f4d6a7e199b6f6afbe65f1fa914c7c4e' }) },
  },
}

export default adapter;