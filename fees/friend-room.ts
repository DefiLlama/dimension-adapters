import { Adapter, } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getFeesExport } from '../helpers/friend-tech';

const friendRoomSharesAddress = '0x9BD0474CC4F118efe56f9f781AA8f0F03D4e7A9c';
const event_trade = 'event Trade(uint256 index, uint256 serverId, address trader, uint256 tokenId, bool isBuy, uint256 shareAmount, uint256 ethAmount, uint256 protocolEthAmount, uint256 subjectEthAmount, uint256 supply)'

const adapter: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: getFeesExport(friendRoomSharesAddress, [event_trade]),
      start: 1693731179,
    },
  },
  version: 2,
}

export default adapter;
