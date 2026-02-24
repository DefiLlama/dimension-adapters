import { Adapter, FetchOptions, } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

const fetch = async ({ getLogs, createBalances, }: FetchOptions) => {
  const dailyFees = createBalances()
  const dailyRevenue = createBalances()

  const logs = await getLogs({ target: "0xcf205808ed36593aa40a44f10c7f7c2f67d4a4d4", eventAbi: 'event Trade(address trader, address subject, bool isBuy, uint256 shareAmount, uint256 ethAmount, uint256 protocolEthAmount, uint256 subjectEthAmount, uint256 supply)' })
  logs.map((e: any) => {
    dailyFees.addGasToken(e.protocolEthAmount, METRIC.PROTOCOL_FEES)
    dailyRevenue.addGasToken(e.protocolEthAmount, METRIC.PROTOCOL_FEES)
    dailyFees.addGasToken(e.subjectEthAmount, METRIC.TRADING_FEES)
  })
  const clubBuy = await getLogs({ target: "0x201e95f275f39a5890c976dc8a3e1b4af114e635", eventAbi: 'event Buy(uint256 indexed id, uint256 indexed pointsIn, uint256 indexed keysOut, uint256 protocolFee)' })
  const clubSell = await getLogs({ target: "0x201e95f275f39a5890c976dc8a3e1b4af114e635", eventAbi: 'event Sell(uint256 indexed id, uint256 indexed pointsOut, uint256 indexed keysIn, uint256 protocolFee)' })
  clubBuy.concat(clubSell).map(e => {
    dailyFees.add("0x0bd4887f7d41b35cd75dff9ffee2856106f86670", e.protocolFee * BigInt(2), METRIC.TRADING_FEES)
    dailyRevenue.add("0x0bd4887f7d41b35cd75dff9ffee2856106f86670", e.protocolFee, METRIC.PROTOCOL_FEES)
  })

  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue }
}

const adapter: Adapter = {
  version: 2,
  fetch,
  chains: [CHAIN.BASE],
  start: '2023-08-09',
  methodology: {
    Fees: "Trading fees paid by users.",
    Revenue: "Portion of fees collected by Friend Tech.",
    ProtocolRevenue: "Portion of fees collected by Friend Tech.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.TRADING_FEES]: "Creator/subject fees collected in ETH from share trades and club key buy/sell trades, paid to key holders.",
      [METRIC.PROTOCOL_FEES]: "Protocol fees collected in ETH from share trades and club key buy/sell trades on Friend Tech.",
    },
  },
}

export default adapter;