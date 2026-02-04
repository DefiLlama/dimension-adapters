import { Adapter, FetchV2, } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const adapter: Adapter = {
  methodology: {
    Fees: "Trading fees paid by users.",
    Revenue: "Portion of fees collected by Friend Tech.",
    ProtocolRevenue: "Portion of fees collected by Friend Tech.",
  },
  breakdownMethodology: {
    Fees: {
      "Share trade protocol fees": "Protocol fees collected in ETH from share trades on Friend Tech.",
      "Share trade creator fees": "Creator/subject fees collected in ETH from share trades, paid to key holders.",
      "Club trade total fees": "Total fees (protocol + subject share) collected in POINTS token from club key trades.",
    },
    Revenue: {
      "Share trade protocol fees": "Protocol fees collected in ETH from share trades on Friend Tech.",
      "Club trade protocol fees": "Protocol fees collected in POINTS token from club key buy/sell trades.",
    },
    ProtocolRevenue: {
      "Share trade protocol fees": "Protocol fees collected in ETH from share trades on Friend Tech.",
      "Club trade protocol fees": "Protocol fees collected in POINTS token from club key buy/sell trades.",
    },
  },
  adapter: {
    [CHAIN.BASE]: {
      fetch: (async ({ getLogs, createBalances, }) => {
        const dailyFees = createBalances()
        const dailyRevenue = createBalances()
        const dailyProtocolRevenue = createBalances()
        const logs = await getLogs({ target: "0xcf205808ed36593aa40a44f10c7f7c2f67d4a4d4", eventAbi: 'event Trade(address trader, address subject, bool isBuy, uint256 shareAmount, uint256 ethAmount, uint256 protocolEthAmount, uint256 subjectEthAmount, uint256 supply)' })
        logs.map((e: any) => {
          dailyFees.addGasToken(e.protocolEthAmount, { label: "Share trade protocol fees" })
          dailyRevenue.addGasToken(e.protocolEthAmount, { label: "Share trade protocol fees" })
          dailyProtocolRevenue.addGasToken(e.protocolEthAmount, { label: "Share trade protocol fees" })
          dailyFees.addGasToken(e.subjectEthAmount, { label: "Share trade creator fees" })
        })
        const clubBuy = await getLogs({ target: "0x201e95f275f39a5890c976dc8a3e1b4af114e635", eventAbi: 'event Buy(uint256 indexed id, uint256 indexed pointsIn, uint256 indexed keysOut, uint256 protocolFee)' })
        const clubSell = await getLogs({ target: "0x201e95f275f39a5890c976dc8a3e1b4af114e635", eventAbi: 'event Sell(uint256 indexed id, uint256 indexed pointsOut, uint256 indexed keysIn, uint256 protocolFee)' })
        clubBuy.concat(clubSell).map(e => {
          dailyFees.add("0x0bd4887f7d41b35cd75dff9ffee2856106f86670", e.protocolFee * BigInt(2), { label: "Club trade total fees" })
          dailyRevenue.add("0x0bd4887f7d41b35cd75dff9ffee2856106f86670", e.protocolFee, { label: "Club trade protocol fees" })
          dailyProtocolRevenue.add("0x0bd4887f7d41b35cd75dff9ffee2856106f86670", e.protocolFee, { label: "Club trade protocol fees" })
        })
        return { dailyFees, dailyRevenue, dailyProtocolRevenue }
      }) as FetchV2,
      start: '2023-08-09',
    },
  },
  version: 2,
}

export default adapter;