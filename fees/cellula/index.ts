import { CHAIN } from "../../helpers/chains";
import { Adapter, FetchV2 } from "../../adapters/types";

const CELL_ADDRESS = "0xa258107cb9dcd325a37c7d65a7f4850bb9986bc6";
const CELL_ABI = "event MintFeeReceived(uint256 tokenId, uint256 amount)"

const LIFE_ADDRESS = "0xabd1780208a62b9cbf9d3b7a1617918d42493933";
const LIFE_ABI = "event FeedEvent(uint256 tokenId, uint256 startTime, uint256 workTime)"

const methodology = {
  Fees: "The cost of renting a Cell.",
  Revenue: "The sum of life charging fees and life mint fees.",
  Protocolrevenue: "Share of 25% of life charging fees and life mint fees.",
  HoldersRevenue: "Share of 5% of life charging fees and life mint fees.",
  SupplySideRevenue: "Share of 70% of life charging fees and life mint fees.",
};
const adapter: Adapter = {
  adapter: {
    [CHAIN.BSC]: {
      fetch: (async ({ getLogs, createBalances, }) => {
        // Fees
        // const totalFees = createBalances()
        const dailyFees = createBalances() // ✅

        // Revenue
        const dailyRevenue = createBalances() // ✅
        const dailyProtocolRevenue = createBalances() // 70% + Food
        const dailyHoldersRevenue = createBalances() //  5%
        const dailySupplySideRevenue = createBalances() // 25%
        // const totalRevenue = createBalances()
        // const totalProtocolRevenue = createBalances()
        // const totalSupplySideRevenue = createBalances()
        // const totalUserFees = createBalances()
        // const dailyBribesRevenue = createBalances()
        // const dailyTokenTaxes = createBalances()

        const logs = await getLogs({ target: CELL_ADDRESS, eventAbi: CELL_ABI })
        logs.map((e: any) => {
          dailyFees.addGasToken(e.amount * BigInt(20))

          dailyRevenue.addGasToken(e.amount * BigInt(20))
          dailyProtocolRevenue.addGasToken(e.amount * BigInt(14))
          dailyHoldersRevenue.addGasToken(e.amount)
          dailySupplySideRevenue.addGasToken(e.amount * BigInt(5))
        })
        const buyFoodLogs = await getLogs({ target: LIFE_ADDRESS, eventAbi: LIFE_ABI })
        // 0.0017 BNB / 1 D
        // 0.0051 BNB / 3 D
        // 0.0119 BNB / 7 D
        const workTimePrice = {
          "86400": "1700000000000000",
          "259200": "5100000000000000",
          "604800": "11900000000000000",
        }
        buyFoodLogs.map(e => {
          if (!workTimePrice[e.workTime]) {
            return
          }
          dailyFees.addGasToken(workTimePrice[e.workTime])
          dailyRevenue.addGasToken(workTimePrice[e.workTime])
          dailyProtocolRevenue.addGasToken(workTimePrice[e.workTime])
        })
        return {
          dailyFees,
          dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue, dailySupplySideRevenue
        }
      }) as FetchV2,
      start: '2024-04-14',
    },
  },
  version: 2,
  methodology
}

export default adapter;
