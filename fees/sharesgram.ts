import { Adapter, } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { getFeesExport } from '../helpers/friend-tech';

// TODO: mark project as dead
const adapter: Adapter = {
  adapter: {
    [CHAIN.BASE]: {
      fetch: getFeesExport('0xbe74a95d159e8e323b8c1a70f825efc85fed27c4'),
      start: '2023-08-28'
    }
  },
  version: 2,
}
export default adapter;
