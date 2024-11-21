import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniV3LogAdapter } from '../../helpers/uniswap'

const adapters: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: getUniV3LogAdapter({ factory: '0x5b1C257B88537d1Ce2AF55a1760336288CcD28B6', }), 
      start: '2024-01-07',
    }
  }
}
export default adapters;
