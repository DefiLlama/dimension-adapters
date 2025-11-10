import { Balances } from "@defillama/sdk";
import { FetchOptions } from "../../adapters/types";
import { METRIC } from "../../helpers/metrics";
import { httpGet } from '../../utils/fetchURL';
import { CHAIN } from "../../helpers/chains";

interface BuybackData {
  amount: string;
  amountUsd: string;
  blocknumber: number;
  createdAt: string;
  transactionHash: string;
}

async function fetchFromApi(options: FetchOptions): Promise<BuybackData[]> {
    const params: Record<string, string> = {
      start: new Date(options.fromTimestamp * 1000).toISOString(),
      end: new Date(options.toTimestamp * 1000).toISOString(),
    }
  
    const buybackApiUrl = `https://api.fluid.instadapp.io/v2/fluid-token/buybacks/charts`;
    return await httpGet(buybackApiUrl, { params });
}

export async function getFluidDailyHoldersRevenue(options: FetchOptions): Promise<Balances> {
  const dailyHoldersRevenue = options.createBalances();

  // Return early if not Ethereum, buyback only done in Ethereum mainnet as of now
  if (options.chain !== CHAIN.ETHEREUM) {
    return dailyHoldersRevenue;
  }

  // Only fetch buyback data for Ethereum
  const buybackData: BuybackData[] = await fetchFromApi(options);

  // If no buyback for the day, return empty balances
  if (!buybackData.length) {
    return dailyHoldersRevenue;
  }

  for (const item of buybackData) {
    dailyHoldersRevenue.addUSDValue(Number(item.amountUsd), METRIC.TOKEN_BUY_BACK);
  }

  return dailyHoldersRevenue;
}
