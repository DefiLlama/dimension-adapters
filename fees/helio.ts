/*
Example swap tx: https://solscan.io/tx/4ZNV9hKmmRch2wiQvoQWuVttTADC38Cf3bSVkyEp8G9uQ1cAzyGgiR6SdPCgWo6sgBVBUuAgYnECrVJ6iZSZtmSM
Helio Fee Account: FudPMePeNqmnjMX19zEKDfGXpbp6HAdW6ZGprB5gYRTZ
Dao Fee Account: JBGUGPmKUEHCpxGGoMowQxoV4c7HyqxEnyrznVPxftqk
*/

import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived, getETHReceived, getSolanaReceived } from "../helpers/token";

const SOL_WALLET = 'FudPMePeNqmnjMX19zEKDfGXpbp6HAdW6ZGprB5gYRTZ';
const EVM_WALLET = '0xa50E658C75dd31C8a1FD29d48F3de26e6d79df5D';

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  if (options.chain === CHAIN.SOLANA) {
    await getSolanaReceived({ options, target: SOL_WALLET, balances: dailyFees });
  }
  else {
    await getETHReceived({ options, target: EVM_WALLET, balances: dailyFees });
    await addTokensReceived({ options, target: EVM_WALLET, balances: dailyFees });
  }

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.SOLANA, CHAIN.ETHEREUM, CHAIN.BASE, CHAIN.POLYGON],
  dependencies: [Dependencies.ALLIUM],
  methodology: {
    Fees: 'Total fees paid by users.',
    Revenue: 'Total fees paid by users.',
    ProtocolRevenue: 'All the fees paid are collected by Helio.',
  }
};

export default adapter;
