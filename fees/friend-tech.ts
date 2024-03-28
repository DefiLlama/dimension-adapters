import { Adapter,} from "../adapters/types";
import { getFeesExport } from "../helpers/friend-tech";
import { CHAIN } from "../helpers/chains";

const adapter: Adapter = {
  adapter: {
    [CHAIN.BASE]: {
      fetch: getFeesExport('0xcf205808ed36593aa40a44f10c7f7c2f67d4a4d4'),
      start: 1691539200,
    },
  },
  version: 2,
}

export default adapter;