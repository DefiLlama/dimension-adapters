import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { queryAllium } from "../helpers/allium";
import { CHAIN } from "../helpers/chains";

// Wormhole token transfers from the Allium warehouse table org_db__defillama.default.wormhole_token_transfers
// (token bridge, NTT, CCTP routed over Wormhole, and other protocols riding Wormhole messaging).
// One aggregated query per window covers every chain pair; each chain then takes the pairs it is the
// source of (outgoing) and the destination of (incoming). Allium's own USD column is summed in-query.
// Rows whose canonical token Allium could not identify are excluded: on a sample day 310 such rows,
// almost all one unpriceable token moved by NEAR's Omni Bridge, carried $93 trillion of bogus USD
// while every identified row was sane. The old bridges-server adapter re-priced those outliers by hand.
// Keys are the chain names as they appear in the table's source_chain / destination_chain columns.
const chainMap: Record<string, string> = {
  ethereum: CHAIN.ETHEREUM,
  solana: CHAIN.SOLANA,
  polygon: CHAIN.POLYGON,
  arbitrum: CHAIN.ARBITRUM,
  base: CHAIN.BASE,
  optimism: CHAIN.OPTIMISM,
  bnb_smart_chain: CHAIN.BSC,
  avalanche: CHAIN.AVAX,
  aptos: CHAIN.APTOS,
  sui: CHAIN.SUI,
  sei: CHAIN.SEI,
  seievm: CHAIN.SEI,
  mantle: CHAIN.MANTLE,
  fantom: CHAIN.FANTOM,
  injective: CHAIN.INJECTIVE,
  moonbeam: CHAIN.MOONBEAM,
  celo: CHAIN.CELO,
  kaia: CHAIN.KLAYTN,
  near: CHAIN.NEAR,
  algorand: CHAIN.ALGORAND,
  terra: CHAIN.TERRA,
  terra2: CHAIN.TERRA2,
  karura: CHAIN.KARURA,
  acala: CHAIN.ACALA,
  oasis: CHAIN.OASIS,
  scroll: CHAIN.SCROLL,
  zksync: CHAIN.ERA,
  xlayer: CHAIN.XLAYER,
  blast: CHAIN.BLAST,
  monad: CHAIN.MONAD,
  unichain: CHAIN.UNICHAIN,
  hyperevm: CHAIN.HYPERLIQUID,
  sonic: CHAIN.SONIC,
  linea: CHAIN.LINEA,
  ink: CHAIN.INK,
  berachain: CHAIN.BERACHAIN,
  mezo: CHAIN.MEZO,
  worldchain: CHAIN.WC,
  noble: CHAIN.NOBLE,
};

type PairRow = { source_chain: string; destination_chain: string; usd: string; txs: string };

const prefetch = async (options: FetchOptions): Promise<PairRow[]> => {
  const rows: PairRow[] = await queryAllium(`
    select source_chain, destination_chain,
           sum(try_cast(token_usd_amount as double)) as usd,
           count(*) as txs
    from org_db__defillama.default.wormhole_token_transfers
    where block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
      and block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
      and status != 'REFUNDED'
      and token_chain_name is not null and token_chain_name != ''
      and token_symbol is not null
      and token_usd_amount is not null
    group by source_chain, destination_chain
  `);
  // Wormhole never has a window with no transfers; an empty result means the table has not caught up
  if (!rows.length) throw new Error(`wormhole: Allium returned no rows for ${options.dateString}, table not caught up`);
  return rows;
};

const fetch = async (options: FetchOptions) => {
  const rows = options.preFetchedResults as PairRow[];
  const dailyOutgoingVolume = options.createBalances();
  const dailyIncomingVolume = options.createBalances();
  let dailyOutgoingTxCount = 0;
  let dailyIncomingTxCount = 0;

  for (const row of rows) {
    const usd = Number(row.usd);
    const txs = Number(row.txs);
    if (chainMap[row.source_chain] === options.chain) {
      dailyOutgoingVolume.addUSDValue(usd);
      dailyOutgoingTxCount += txs;
    }
    if (chainMap[row.destination_chain] === options.chain) {
      dailyIncomingVolume.addUSDValue(usd);
      dailyIncomingTxCount += txs;
    }
  }

  return { dailyOutgoingVolume, dailyIncomingVolume, dailyOutgoingTxCount, dailyIncomingTxCount };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  prefetch: prefetch as any,
  chains: [...new Set(Object.values(chainMap))],
  start: "2022-01-15", // first real row in the Allium table (a few rows carry 1970 timestamps and are ignored)
  dependencies: [Dependencies.ALLIUM],
  methodology: {
    OutgoingVolume: "USD value of Wormhole token transfers leaving each chain, as priced in the Allium Wormhole transfers table. Transfers of tokens Allium could not identify are excluded.",
    IncomingVolume: "USD value of Wormhole token transfers arriving on each chain, as priced in the Allium Wormhole transfers table. Transfers of tokens Allium could not identify are excluded.",
    OutgoingTxCount: "Number of Wormhole token transfers leaving each chain.",
    IncomingTxCount: "Number of Wormhole token transfers arriving on each chain.",
  },
};

export default adapter;
