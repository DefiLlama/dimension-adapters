import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getETHReceived, getSolanaReceived } from "../helpers/token";
import { fetchBuilderCodeRevenue } from "../helpers/hyperliquid";


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

const HL_BUILDER_ADDRESS = '0xb84168cf3be63c6b8dad05ff5d755e97432ff80b';

// Solana fetch function
const fetchSolana = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = await getSolanaReceived({ 
    options, 
    targets: solana_fee_wallet_addresses, 
    blacklist_signers: solana_fee_wallet_addresses 
  });
  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
};

// ETH fetch function for each chain
const fetchETH = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = await getETHReceived({
    options,
    targets: eth_fee_wallet_addresses
  });
  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
};

const fetchHL = async (_a: any, _b: any, options: FetchOptions) => {
  const { dailyFees, dailyRevenue, dailyProtocolRevenue } = await fetchBuilderCodeRevenue({ options, builder_address: HL_BUILDER_ADDRESS });
  return { dailyFees, dailyRevenue, dailyProtocolRevenue, };
};

const meta = {
  methodology: {
    Fees: 'All fees paid by users for swapping, bridging in Phantom wallet And Builder Code Fees.',
    Revenue: 'Fees collected by Phantom and Builder Code Fees from Hyperliquid Perps.',
    ProtocolRevenue: 'Fees collected by Phantom and Builder Code Fees from Hyperliquid Perps.',
  }
}

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetchSolana,
      meta,
    },
    [CHAIN.ETHEREUM]: {
      fetch: fetchETH,
      meta,
    },
    [CHAIN.BASE]: {
      fetch: fetchETH,
      meta,
    },
    [CHAIN.POLYGON]: {
      fetch: fetchETH,
      meta,
    },
    [CHAIN.HYPERLIQUID]: {
      fetch: fetchHL,
      start: '2025-07-01',
    meta
    }
  },
  isExpensiveAdapter: true
};

export default adapter;
