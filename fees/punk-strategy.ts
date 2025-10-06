import { FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

export default {
  chains: [CHAIN.ETHEREUM],
  fetch,
  version: 2,
  methodology: {
    Fees: "10% of the PNKSTR swap value",
    Revenue: "10% of the PNKSTR swap value",
    ProtocolRevenue: "20% of the tokens fees",
    SupplySideRevenue: "n/a",
    HoldersRevenue: "Value of the punk sale, the ETH from the sale is used to buy back and burn PNKSTR tokens",
  },
  start: '2025-09-07',
}

async function fetch({ getLogs, createBalances, fromApi, toApi, }: FetchOptions) {
  const dailyFees = createBalances()
  const dailyHoldersRevenue = createBalances()

  const feeDayBefore = await fromApi.call({ target: '0xc50673edb3a7b94e8cad8a7d4e0cd68864e33edf', abi: 'uint256:currentFees' })
  const feeToday = await toApi.call({ target: '0xc50673edb3a7b94e8cad8a7d4e0cd68864e33edf', abi: 'uint256:currentFees' })

  dailyFees.addGasToken(feeToday - feeDayBefore)

  const feeLogs = await getLogs({
    target: '0x1244EAe9FA2c064453B5F605d708C0a0Bfba4838',
    eventAbi: 'event ProtocolFeesFromSales(uint256 fees)',
  })

  dailyHoldersRevenue.addGasToken(feeLogs.map(log => log.fees))

  return {
    dailyFees,
    dailyHoldersRevenue,
    dailyProtocolRevenue: dailyFees.clone(0.2),
    dailySupplySideRevenue: 0,
    dailyRevenue: dailyFees,
  }
}