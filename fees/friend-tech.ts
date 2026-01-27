import { Adapter, FetchV2, } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const adapter: Adapter = {
  methodology: {
    Fees: "Trading fees paid by users.",
    Revenue: "Portion of fees collected by Friend Tech.",
    ProtocolRevenue: "Portion of fees collected by Friend Tech.",
  },
  adapter: {
    [CHAIN.BASE]: {
      fetch: (async ({ getLogs, createBalances, }) => {
        const dailyFees = createBalances()
        const dailyRevenue = createBalances()
        const logs = await getLogs({ target: "0xcf205808ed36593aa40a44f10c7f7c2f67d4a4d4", eventAbi: 'event Trade(address trader, address subject, bool isBuy, uint256 shareAmount, uint256 ethAmount, uint256 protocolEthAmount, uint256 subjectEthAmount, uint256 supply)' })
        logs.map((e: any) => {
          dailyFees.addGasToken(e.protocolEthAmount)
          dailyRevenue.addGasToken(e.protocolEthAmount)
          dailyFees.addGasToken(e.subjectEthAmount)
        })
        const clubBuy = await getLogs({ target: "0x201e95f275f39a5890c976dc8a3e1b4af114e635", eventAbi: 'event Buy(uint256 indexed id, uint256 indexed pointsIn, uint256 indexed keysOut, uint256 protocolFee)' })
        const clubSell = await getLogs({ target: "0x201e95f275f39a5890c976dc8a3e1b4af114e635", eventAbi: 'event Sell(uint256 indexed id, uint256 indexed pointsOut, uint256 indexed keysIn, uint256 protocolFee)' })
        clubBuy.concat(clubSell).map(e => {
          dailyFees.add("0x0bd4887f7d41b35cd75dff9ffee2856106f86670", e.protocolFee * BigInt(2))
          dailyRevenue.add("0x0bd4887f7d41b35cd75dff9ffee2856106f86670", e.protocolFee)
        })
        return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue }
      }) as FetchV2,
      start: '2023-08-09',
    },
  },
  version: 2,
}

export default adapter;