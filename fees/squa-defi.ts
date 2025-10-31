import { Adapter, } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";
import { getFeesExport } from "../helpers/friend-tech";

const keyManagerQureFiAddr = '0xfad362E479AA318F2De7b2c8a1993Df9BB2B3b1f';
const event_trade = 'event Trade(address indexed trader,address indexed influencer,uint8 indexed direction,uint256 keysAmount,uint256 price,uint256 protocolEthAmount,uint256 subjectEthAmount,uint256 keysSupply)';

const adapter: Adapter = {
  adapter: {
    [CHAIN.BASE]: {
      fetch: getFeesExport(keyManagerQureFiAddr, [event_trade], {
        token: ADDRESSES.base.USDC,
      }),
      start: '2023-12-22',
    },
  },
  version: 2,
  methodology: {
    Fees: "Fees paid by users while trading on social network.",
    Revenue: "Fees paid by users while trading on social network.",
  }
}

export default adapter;
