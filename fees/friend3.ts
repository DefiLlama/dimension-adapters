import { Adapter, } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getFeesExport } from "../helpers/friend-tech";

const FriendV1Address = '0x1e70972ec6c8a3fae3ac34c9f3818ec46eb3bd5d';
const event_trade = 'event Trade(address trader, address subject, bool isBuy, uint256 ticketAmount, uint256 ethAmount, uint256 protocolEthAmount, uint256 subjectEthAmount, uint256 supply)'

const FriendV2Address = '0x2C5bF6f0953ffcDE678A35AB7d6CaEBC8B6b29F0';
const event_trade_V2 = 'event Trade (address trader , bytes32 subjectId , bool isBuy , uint256 ticketAmount , uint256 tokenAmount , uint256 protocolEthAmount , uint256 protocolEthAmount , uint256 holderEthAmount , uint256 referrerEthAmount , uint256 supply)'

const adapter: Adapter = {
  methodology: {
    Fees: "Fees paid by users while trading on social network.",
    Revenue: "Fees paid by users while trading on social network.",
  },
  adapter: {
    [CHAIN.BSC]: {
      fetch: getFeesExport(FriendV1Address, [event_trade]),
      start: '2023-08-24',
    },
    [CHAIN.OP_BNB]: {
      fetch: getFeesExport(FriendV2Address, [event_trade_V2]),
      start: '2023-10-31',
    },
  },
  version: 2,
}

export default adapter;
