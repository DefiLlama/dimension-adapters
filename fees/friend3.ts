import { Adapter, Fetch, FetchOptions, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const FriendV1Address = '0x1e70972ec6c8a3fae3ac34c9f3818ec46eb3bd5d';
const event_trade = 'event Trade(address trader, address subject, bool isBuy, uint256 ticketAmount, uint256 ethAmount, uint256 protocolEthAmount, uint256 subjectEthAmount, uint256 supply)'

const FriendV2Address = '0x2C5bF6f0953ffcDE678A35AB7d6CaEBC8B6b29F0';
const event_trade_V2 = 'event Trade (address trader , bytes32 subjectId , bool isBuy , uint256 ticketAmount , uint256 tokenAmount , uint256 protocolAmount , uint256 subjectAmount , uint256 holderAmount , uint256 referralAmount , uint256 supply)'


const fetch = (async (timestamp: number, _cb: any, { getLogs, createBalances }: FetchOptions): Promise<FetchResultFees> => {
  let logs = await getLogs({ target: FriendV1Address, eventAbi: event_trade, })
  const dailyFees = createBalances()
  const dailyRevenue = createBalances()
  logs.forEach(i => {
    dailyFees.addGasToken(i.protocolEthAmount)
    dailyFees.addGasToken(i.subjectEthAmount)
    dailyRevenue.addGasToken(i.protocolEthAmount)
  })
  return { dailyFees, dailyRevenue, timestamp }
}) as Fetch

const fetchOpbnb = (async (timestamp: number, _cb: any, { getLogs, createBalances }: FetchOptions): Promise<FetchResultFees> => {

  let logs = await getLogs({ target: FriendV2Address, eventAbi: event_trade_V2, })
  const dailyFees = createBalances()
  const dailyRevenue = createBalances()
  logs.forEach(i => {
    dailyFees.addGasToken(i.protocolAmount)
    dailyFees.addGasToken(i.subjectAmount)
    dailyFees.addGasToken(i.holderAmount)
    dailyRevenue.addGasToken(i.protocolEthAmount)
    dailyRevenue.addGasToken(i.referralAmount * -1)
  })
  return { dailyFees, dailyRevenue, timestamp }
}) as Fetch


const adapter: Adapter = {
  adapter: {
    [CHAIN.BSC]: {
      fetch: fetch,
      start: 1692835200,
    },
    [CHAIN.OP_BNB]: {
      fetch: fetchOpbnb,
      start: 1698710400,
    },
  }
}

export default adapter;
