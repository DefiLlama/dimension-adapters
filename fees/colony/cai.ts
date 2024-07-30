import { Balances } from "@defillama/sdk";
import { FetchOptions } from "../../adapters/types";
import { queryDune } from "../../helpers/dune";
import BigNumber from "bignumber.js";

const usdcToken = '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E'

interface CaiFees {
  dailyProtocolRevenue: Balances;
  totalProtocolRevenue: Balances;
  dailyHoldersRevenue: Balances;
  totalHoldersRevenue: Balances;
}

interface DuneResponse {
  fees: string;
  cum_fees: string;
  date: string;
}

export async function caiFees(options: FetchOptions): Promise<CaiFees> {
  const dailyProtocolRevenue = options.createBalances();
  const totalProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const totalHoldersRevenue = options.createBalances();

  try {
    const response = (await queryDune("3944152"));

    const result = response.filter((x: DuneResponse) => {
      const recordTimestamp = Date.parse(x.date) / 1000
      return recordTimestamp >= options.fromTimestamp && recordTimestamp < options.toTimestamp
    })

    dailyProtocolRevenue.addToken(usdcToken, new BigNumber(result[0].fees).multipliedBy(0.5).multipliedBy(1e6).toFixed(0))
    totalProtocolRevenue.addToken(usdcToken, new BigNumber(result[0].cum_fees).multipliedBy(0.5).multipliedBy(1e6).toFixed(0))

    dailyHoldersRevenue.addToken(usdcToken, new BigNumber(result[0].fees).multipliedBy(0.5).multipliedBy(1e6).toFixed(0))
    totalHoldersRevenue.addToken(usdcToken, new BigNumber(result[0].cum_fees).multipliedBy(0.5).multipliedBy(1e6).toFixed(0))
  } catch (e) {
    console.error(e);
  }

  return {
    dailyProtocolRevenue,
    totalProtocolRevenue,
    dailyHoldersRevenue,
    totalHoldersRevenue
  }
}

