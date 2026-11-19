import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getEnv } from "../helpers/env";
import { httpGet } from "../utils/fetchURL";

// Chainlink CCIP token transfers, from Chainlink's CCIP metrics API.
// The API serves one complete UTC-day snapshot per date: one row per message with its source and destination chain.
// The source chain gets the outgoing leg, the destination chain the incoming leg.
// Volume uses the API's tokenAmountUsd: tokenAmount mixes human units and base units across token integrations,
// so it cannot be priced from the raw amount (noted in bridges-server's CCIP adapter).
const API = "https://dsa-metrics-api-gw-8p4u7g34.nw.gateway.dev/v1/ccip_transactions";

// API chain labels -> DefiLlama chains.
const chainMap: Record<string, string> = {
  "0g": CHAIN.OG,
  abstract: CHAIN.ABSTRACT,
  adi: CHAIN.ADI,
  apechain: CHAIN.APECHAIN,
  aptos: CHAIN.APTOS,
  arbitrum: CHAIN.ARBITRUM,
  arc: CHAIN.ARC,
  astar: CHAIN.ASTAR,
  avalanche: CHAIN.AVAX,
  base: CHAIN.BASE,
  berachain: CHAIN.BERACHAIN,
  bitlayer: CHAIN.BITLAYER,
  bittensor: CHAIN.BITTENSOR,
  blast: CHAIN.BLAST,
  bob: CHAIN.BOB,
  botanix: CHAIN.BOTANIX,
  bsc: CHAIN.BSC,
  bsquared: CHAIN.BSQUARED,
  canton: CHAIN.CANTON,
  celo: CHAIN.CELO,
  core: CHAIN.CORE,
  corn: CHAIN.CORN,
  cronos: CHAIN.CRONOS,
  "cronos zkevm": CHAIN.CRONOS_ZKEVM,
  ethereum: CHAIN.ETHEREUM,
  etherlink: CHAIN.ETHERLINK,
  everclear: CHAIN.EVERCLEAR,
  fhe: CHAIN.MIND_NETWORK,
  "mind network": CHAIN.MIND_NETWORK,
  fraxtal: CHAIN.FRAXTAL,
  hedera: CHAIN.HEDERA,
  hemi: CHAIN.HEMI,
  hsk: CHAIN.HASHKEY,
  hyperliquid: CHAIN.HYPERLIQUID,
  ink: CHAIN.INK,
  kaia: CHAIN.KLAYTN,
  klaytn: CHAIN.KLAYTN,
  katana: CHAIN.KATANA,
  lens: CHAIN.LENS,
  linea: CHAIN.LINEA,
  lisk: CHAIN.LISK,
  mantle: CHAIN.MANTLE,
  megaeth: CHAIN.MEGAETH,
  merlin: CHAIN.MERLIN,
  metal: CHAIN.METAL,
  metis: CHAIN.METIS,
  mint: CHAIN.MINT,
  mode: CHAIN.MODE,
  monad: CHAIN.MONAD,
  morph: CHAIN.MORPH,
  neox: CHAIN.NEO_X_MAINNET,
  opbnb: CHAIN.OP_BNB,
  optimism: CHAIN.OPTIMISM,
  pharos: CHAIN.PHAROS,
  plasma: CHAIN.PLASMA,
  plume: CHAIN.PLUME,
  polygon: CHAIN.POLYGON,
  "polygon zkevm": CHAIN.POLYGON_ZKEVM,
  robinhood: CHAIN.ROBINHOOD,
  ronin: CHAIN.RONIN,
  rsk: CHAIN.ROOTSTOCK,
  scroll: CHAIN.SCROLL,
  sei: CHAIN.SEI,
  shibarium: CHAIN.SHIBARIUM,
  solana: CHAIN.SOLANA,
  soneium: CHAIN.SONEIUM,
  sonic: CHAIN.SONIC,
  stable: CHAIN.STABLE,
  tac: CHAIN.TAC,
  taiko: CHAIN.TAIKO,
  tempo: CHAIN.TEMPO,
  unichain: CHAIN.UNICHAIN,
  wemix: CHAIN.WEMIX,
  "world chain": CHAIN.WC,
  xdai: CHAIN.XDAI,
  xdc: CHAIN.XDC,
  "x layer": CHAIN.XLAYER,
  zircuit: CHAIN.ZIRCUIT,
  "zksync era": CHAIN.ERA,
  zora: CHAIN.ZORA,
};

type CcipTx = {
  sourceChain: string; destChain: string; tokenAddressSource?: string; tokenAddressDest?: string; tokenAmountUsd: number; blockTimestamp: number;
};

// one daily snapshot, shared by every chain
const prefetch = async (options: FetchOptions): Promise<CcipTx[]> => {
  const data = await httpGet(`${API}?date=${options.dateString}`, { headers: { "x-api-key": getEnv("CCIP_API_KEY") } });
  if (!Array.isArray(data?.transactions)) throw new Error("ccip: unexpected API response");
  return data.transactions;
};

const fetch = async (options: FetchOptions) => {
  const txs: CcipTx[] = options.preFetchedResults;
  const dailyOutgoingVolume = options.createBalances();
  const dailyIncomingVolume = options.createBalances();
  let dailyOutgoingTxCount = 0;
  let dailyIncomingTxCount = 0;

  for (const tx of txs) {
    // legs without a token address (some Solana routes) carry no transfer
    if (chainMap[tx.sourceChain] === options.chain && tx.tokenAddressSource) {
      dailyOutgoingVolume.addUSDValue(tx.tokenAmountUsd);
      dailyOutgoingTxCount++;
    }
    if (chainMap[tx.destChain] === options.chain && tx.tokenAddressDest) {
      dailyIncomingVolume.addUSDValue(tx.tokenAmountUsd);
      dailyIncomingTxCount++;
    }
  }

  return { dailyOutgoingVolume, dailyIncomingVolume, dailyOutgoingTxCount, dailyIncomingTxCount };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  prefetch: prefetch as any,
  chains: [...new Set(Object.values(chainMap))],
  methodology: {
    OutgoingVolume: "USD value of tokens sent from each chain through Chainlink CCIP, as valued by Chainlink's CCIP metrics API.",
    IncomingVolume: "USD value of tokens delivered to each chain through Chainlink CCIP, as valued by Chainlink's CCIP metrics API.",
    OutgoingTxCount: "Number of CCIP token transfers sent from each chain.",
    IncomingTxCount: "Number of CCIP token transfers delivered to each chain.",
  },
};

export default adapter;
