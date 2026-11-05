import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getETHReceived, getSolanaReceived } from "../helpers/token";

// Solana fee wallet addresses
const solana_fee_wallet_addresses = [
  '25mYnjJ2MXHZH6NvTTdA63JvjgRVcuiaj6MRiEQNs1Dq',
  '9yj3zvLS3fDMqi1F8zhkaWfq8TZpZWHe6cz1Sgt7djXf',
  '8psNvWTrdNTiVRNzAgsou9kETXNJm2SXZyaKuJraVRtf',
  'CnmA6Zb8hLrG33AT4RTzKdGv1vKwRBKQQr8iNckvv8Yg',
  '2rQZb9xqQGwoCMDkpabbzDB9wyPTjSPj9WNhJodTaRHm',
  '9gnLg6NtVxaASvxtADLFKZ9s8yHft1jXb1Vu6gVKvh1J',
  'wtpXRqKLdGc7vpReogsRugv6EFCw4HBHcxm8pFcR84a',
  'D1NJy3Qq3RKBG29EDRj28ozbGwnhmM5yBUp8PonSYUnm',
];

const solana_blacklist_mints = [
  'DWxU1Ew5yjFebSui8xzRYPE3FwgGzp8F1iKcQFyUezJX',
  '2xaPstY4XqJ2gUA1mpph3XmvmPZGuTuJ658AeqX3gJ6F',
  'Dsx5h4jk8vyQjd8B9JF9cydNTz87KgPqUG2QCGH9PjCh',
];

// ETH fee wallet addresses
const eth_fee_wallet_addresses = [
  '0x1bcc58d165e5374d7b492b21c0a572fd61c0c2a0',
  '0x7afa9d836d2fccf172b66622625e56404e465dbd',
  '0x2cffed5d56eb6a17662756ca0fdf350e732c9818',
  // Took over from 0x2cffed5d on 2026-10-06. No transfer links the two wallets, the tie is behavioural: same 0.85% rate
  // (https://help.phantom.com/articles/5985106844435), switched in the same minutes on Ethereum and Base. On Ethereum:
  // last native to the old wallet 0x34a80288481faea4d0edab6196a4648a8e654644ffc41a0f1d38c682b9300d7e (20:58:23 UTC),
  // first native to this one 0x530f50835cb85b3c6a875fe618c203307953eeb8c4b34d93a1d2fb2fb5e08152 (20:57:59 UTC).
  '0x7d8eb200c45c273e3bef1bc55c09f76805158e96',
];

// Solana fetch function
const fetchSolana = async (options: FetchOptions) => {
  // throw new Error('Fix bug that inflates fees')
  const dailyFees = await getSolanaReceived({
    options,
    targets: solana_fee_wallet_addresses,
    blacklist_signers: solana_fee_wallet_addresses,
    blacklist_mints: solana_blacklist_mints,
  });
  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
};

// ETH fetch function for each chain
const fetch = async (options: FetchOptions) => {
  // throw new Error('Fix bug that inflates fees')
  const dailyFees = await getETHReceived({
    options,
    targets: eth_fee_wallet_addresses,

    // Phantom uses Matcha to sell their tokens for ETH
    // we must exclude ETH transferred from Matcha Router contracts
    notFromSenders: [
      '0x8331f9ACcE69b02C281F40a00706f758665ccE77',
      '0x07d889ebae9E9203a0443EdBa3cB5ca499c4ceF1',
    ],
  });
  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
};

const methodology = {
  Fees: 'All fees paid by users for swapping, bridging in Phantom wallet.',
  Revenue: 'Fees collected by Phantom.',
  ProtocolRevenue: 'Fees collected by Phantom.',
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  dependencies: [Dependencies.ALLIUM],
  methodology,
  adapter: {
    [CHAIN.SOLANA]: { fetch: fetchSolana },
    [CHAIN.ETHEREUM]: { fetch },
    [CHAIN.BASE]: { fetch },
    [CHAIN.POLYGON]: { fetch },
    [CHAIN.MONAD]: { fetch },
  },
  isExpensiveAdapter: true
};

export default adapter;
