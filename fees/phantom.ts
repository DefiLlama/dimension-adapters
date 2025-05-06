import { FetchOptions, SimpleAdapter } from "../adapters/types";
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

// ETH fee wallet addresses
const eth_fee_wallet_addresses = [
  '0x1bcc58d165e5374d7b492b21c0a572fd61c0c2a0',
  '0x7afa9d836d2fccf172b66622625e56404e465dbd'
];

// Solana fetch function
const fetchSolana = async (options: FetchOptions) => {
  const dailyFees = await getSolanaReceived({ 
    options, 
    targets: solana_fee_wallet_addresses, 
    blacklist_signers: solana_fee_wallet_addresses 
  });
  return { dailyFees, dailyRevenue: dailyFees };
};

// ETH fetch function for each chain
const fetchETH = async (options: FetchOptions) => {
  const dailyFees = await getETHReceived({
    options,
    targets: eth_fee_wallet_addresses
  });
  return { dailyFees, dailyRevenue: dailyFees };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetchSolana,
    },
    [CHAIN.ETHEREUM]: {
      fetch: fetchETH,
    },
    [CHAIN.BASE]: {
      fetch: fetchETH,
    },
    [CHAIN.POLYGON]: {
      fetch: fetchETH,
    }
  },
  isExpensiveAdapter: true
};

export default adapter;
