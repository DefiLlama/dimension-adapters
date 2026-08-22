import { FetchOptions, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { METRIC } from "../../helpers/metrics"

// Furety FTY token on Polygon mainnet:
// https://polygonscan.com/token/0xD1f0Cd986Da6E05619Ef81559BCA5e82609A66E5
const FTY_TOKEN = "0xD1f0Cd986Da6E05619Ef81559BCA5e82609A66E5"

// FuretyServicePayment on Polygon mainnet:
// https://polygonscan.com/address/0x9fc46059156AbC2c45AFe8Aee68E11c2c498794a
const SERVICE_PAYMENT_CONTRACT = "0x9fc46059156AbC2c45AFe8Aee68E11c2c498794a"

const SERVICE_PAID_EVENT =
  "event ServicePaid(address indexed payer, address indexed treasury, bytes32 indexed reservationRef, uint256 amount)"

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances()

  const logs = await options.getLogs({
    target: SERVICE_PAYMENT_CONTRACT,
    eventAbi: SERVICE_PAID_EVENT,
    onlyArgs: true,
  })

  for (const log of logs) {
    dailyFees.add(FTY_TOKEN, log.amount, METRIC.SERVICE_FEES)
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.POLYGON],
  start: "2026-06-29",
  methodology: {
    Fees: "FTY service payments submitted through the FuretyServicePayment contract on Polygon.",
    UserFees: "FTY paid by users for Furety service requests.",
    Revenue: "FTY service payments settled to the configured Furety treasury or approved merchant wallet.",
    ProtocolRevenue: "FTY service payments settled through the FuretyServicePayment contract.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.SERVICE_FEES]: "Service payments emitted by the ServicePaid event.",
    },
  },
}

export default adapter
