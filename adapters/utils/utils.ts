import { Balances } from "@defillama/sdk"
import { FetchResponseValue } from "../types";

export function createBalanceFrom(chain: string, timestamp: number | undefined, amount: FetchResponseValue | undefined): Balances {
  const balance = new Balances({ chain, timestamp })
  if (amount) {
    if (typeof amount === 'number' || typeof amount === 'string') {
      balance.addUSDValue(amount)
    } else {
      balance.addBalances(amount)
    }
  }
  return balance;
}

export async function subtractBalance(balance: Balances, amount: FetchResponseValue | undefined) {
  if (amount) {
    if (typeof amount === 'number' || typeof amount === 'string') {
      const usdValue = await balance.getUSDValue()
      balance.resizeBy(0)
      balance.addUSDValue(Number(usdValue) - Number(amount))
    } else {
      balance.subtract(amount)
    }
  }
}

export async function validateAdapterResult(chain: string, result: any) {
  // validate and auto compoute revenue if any
  for (const key of ['daily', 'total']) {
    const recordFees = `${key}Fees`
    const recordSupplySideRevenue = `${key}SupplySideRevenue`
    const recordProtocolRevenue = `${key}ProtocolRevenue`
    const recordRevenue = `${key}Revenue`

    if (result[recordFees]) {
      // should include atleast SupplySideRevenue or ProtocolRevenue or Revenue
      if (!result[recordSupplySideRevenue] && !result[recordProtocolRevenue] && !result[recordRevenue]) {
        throw Error(`found ${recordFees} record but missing all ${recordRevenue}, ${recordSupplySideRevenue}, ${recordProtocolRevenue} records`)
      }

      // if we have supplySideRevenue but missing revenue, add revenue = fees - supplySideRevenue
      if (result[recordSupplySideRevenue] && !result[recordRevenue]) {
        result[recordRevenue] = createBalanceFrom(chain, result.timestamp, result[recordFees])
        await subtractBalance(result[recordRevenue], result[recordSupplySideRevenue])
      }

      // if we have protocolRevenue byut missing revenue, add revenue = protocolRevenue
      if (result[recordProtocolRevenue] && !result[recordRevenue]) {
        result[recordRevenue] = createBalanceFrom(chain, result.timestamp, result[recordProtocolRevenue])
      }

      // if we have revenue but missing protocolRevenue, add protocolRevenue = revenue
      if (result[recordRevenue] && !result[recordProtocolRevenue]) {
        result[recordProtocolRevenue] = createBalanceFrom(chain, result.timestamp, result[recordRevenue])
      }
    }
  }
}
