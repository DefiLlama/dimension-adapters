import { Adapter, } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getFeesExport } from '../helpers/friend-tech';

const FriendtechSharesAddress = '0xbc98176dc471cb67dc19fa4558104f034d8965fa';
const event_trade = 'event Trade(address trader,uint256 channelId,bool isBuy,uint256 shareAmount,uint256 totalShares,uint256 ethAmount,uint256 protocolEthAmount,uint256 subjectEthAmount,uint256 totalSupply,uint256 channelFeePerShare)'

const adapter: Adapter = {
  adapter: {
    [CHAIN.BASE]: {
      fetch: getFeesExport(FriendtechSharesAddress, [event_trade]),
      start: '2023-10-02',
    },
  },
  version: 2,
  methodology: {
    Fees: "Fees paid by users while trading on social network.",
    Revenue: "Fees paid by users while trading on social network.",
  }
}

export default adapter;
