/*
Example swap tx: https://solscan.io/tx/4ZNV9hKmmRch2wiQvoQWuVttTADC38Cf3bSVkyEp8G9uQ1cAzyGgiR6SdPCgWo6sgBVBUuAgYnECrVJ6iZSZtmSM
Helio Fee Account: FudPMePeNqmnjMX19zEKDfGXpbp6HAdW6ZGprB5gYRTZ
Dao Fee Account: JBGUGPmKUEHCpxGGoMowQxoV4c7HyqxEnyrznVPxftqk
*/

import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getSolanaReceived } from "../helpers/token";

const fetch: any = async (options: FetchOptions) => {
  const dailyFees = await getSolanaReceived({ options, target: 'FudPMePeNqmnjMX19zEKDfGXpbp6HAdW6ZGprB5gYRTZ' })
  dailyFees.resizeBy(1.11)

  const protocolRevenue = dailyFees.clone()
  const dailyHoldersRevenue = dailyFees.clone(0.1)
  protocolRevenue.subtract(dailyHoldersRevenue)

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: protocolRevenue, dailyHoldersRevenue: dailyHoldersRevenue }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetch,
    },
  },
  isExpensiveAdapter: true,
  methodology: {
    Fees: 'Total fees paid by users.',
    Revenue: 'Total fees paid by users.',
    ProtocolRevenue: '90% fees paid are collected by Helio.',
    HoldersRevenue: '10% fees paid are distributed to holders.',
  }
};

export default adapter;
