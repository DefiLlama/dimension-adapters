/*
Example swap tx: https://solscan.io/tx/4ZNV9hKmmRch2wiQvoQWuVttTADC38Cf3bSVkyEp8G9uQ1cAzyGgiR6SdPCgWo6sgBVBUuAgYnECrVJ6iZSZtmSM
Helio Fee Account: FudPMePeNqmnjMX19zEKDfGXpbp6HAdW6ZGprB5gYRTZ
Dao Fee Account: JBGUGPmKUEHCpxGGoMowQxoV4c7HyqxEnyrznVPxftqk
*/

import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDune } from "../helpers/dune";

const solanaDecimals = {
    EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: 6,
    Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: 6
} as any

const fetch: any = async (options: FetchOptions) => {
  const receivedTokens = (await queryDune("3996080", {
    start: options.startTimestamp,
    end: options.endTimestamp,
    receiver: 'FudPMePeNqmnjMX19zEKDfGXpbp6HAdW6ZGprB5gYRTZ'
  })) as any[]
  const dailyFees = options.createBalances();
  receivedTokens.forEach(row=>{
    if(!solanaDecimals[row.token_mint_address]){
        throw new Error("unsupported token")
    }
    dailyFees.add(row.token_mint_address, (row.received * 10**solanaDecimals[row.token_mint_address]).toFixed(0))
  })
  dailyFees.resizeBy(1.11)

  return { dailyFees, dailyRevenue: dailyFees, dailyHoldersRevenue: dailyFees.clone(0.1) }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetch,
      start: 0,
    },
  },
  isExpensiveAdapter: true
};

export default adapter;
