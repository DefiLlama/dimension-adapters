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
    // The fee account sells the SOL it collects for USDC in its own txs, and the USDC comes back from a DEX vault, e.g.
    // 409 SOL -> 40,568 USDC in 3nnrKZZPPHQXDXsR1LJ7LtAkQBLJHGUW3XuVEbT4eDX6tBzLfy6SR5mwGxyRavQAJoT52YHJoWRvkQbmpCEs7xuP.
    // blacklist_signers would miss some: 2gGByYsm6JJwEKJ1N59BZvBGd1Zkpvz1Uhmxzs9dfxdNMMpUubr9nN7GsWo52qH3pF58bPTnCjiyzsu8zyBB4PTt has a relayer as fee payer.
    await getSolanaReceived({ options, target: SOL_WALLET, balances: dailyFees, blacklist_tx_senders: [SOL_WALLET] });
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
    Fees: 'Total fees paid by users. On Solana, tokens the fee account receives in txs where it also sends tokens (its own SOL to USDC swaps) are not counted.',
    Revenue: 'Total fees paid by users, excluding txs on Solana in which the fee account also sends tokens.',
    ProtocolRevenue: 'All the fees paid are collected by Helio, excluding txs on Solana in which the fee account also sends tokens.',
  }
};

export default adapter;
