import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

// Layerswap completed swaps from its public explorer feed, newest first by close date, paged with a swap-id cursor.
// The feed has no date filter, so only the last 24h can be read (runAtCurrTime). Each swap has an input tx on the
// source network (outgoing) and an output tx on the destination network (incoming); each leg is counted on its own
// chain at its own timestamp, valued with the feed's amount_in_usd.
const API = "https://api.layerswap.io/api/v2/explorer";
const PAGE_SIZE = 200;
const MAX_PAGES = 200;

// Layerswap network name -> DefiLlama chain.
const networks: Record<string, string> = {
  ETHEREUM_MAINNET: CHAIN.ETHEREUM,
  ARBITRUM_MAINNET: CHAIN.ARBITRUM,
  ARBITRUMNOVA_MAINNET: CHAIN.ARBITRUM_NOVA,
  OPTIMISM_MAINNET: CHAIN.OPTIMISM,
  BASE_MAINNET: CHAIN.BASE,
  LINEA_MAINNET: CHAIN.LINEA,
  BLAST_MAINNET: CHAIN.BLAST,
  SCROLL_MAINNET: CHAIN.SCROLL,
  BSC_MAINNET: CHAIN.BSC,
  XLAYER_MAINNET: CHAIN.XLAYER,
  TAIKO_MAINNET: CHAIN.TAIKO,
  ZKSYNCERA_MAINNET: CHAIN.ERA,
  MODE_MAINNET: CHAIN.MODE,
  MANTA_MAINNET: CHAIN.MANTA,
  POLYGONZK_MAINNET: CHAIN.POLYGON_ZKEVM,
  POLYGON_MAINNET: CHAIN.POLYGON,
  AVAX_MAINNET: CHAIN.AVAX,
  OPBNB_MAINNET: CHAIN.OP_BNB,
  GRAVITY_MAINNET: CHAIN.GRAVITY,
  BOB_MAINNET: CHAIN.BOB,
  MANTLE_MAINNET: CHAIN.MANTLE,
  ZORA_MAINNET: CHAIN.ZORA,
  FRAXTAL_MAINNET: CHAIN.FRAXTAL,
  FUSE_MAINNET: CHAIN.FUSE,
  GNOSIS_MAINNET: CHAIN.XDAI,
  ANCIENT8_MAINNET: CHAIN.ANCIENT8,
  CELO_MAINNET: CHAIN.CELO,
  IMMUTABLEZK_MAINNET: CHAIN.IMX,
  KAIA_MAINNET: CHAIN.KLAYTN,
  LISK_MAINNET: CHAIN.LISK,
  RARI_MAINNET: CHAIN.RARI,
  SHAPE_MAINNET: CHAIN.SHAPE,
  WORLDCHAIN_MAINNET: CHAIN.WC,
  ZIRCUIT_MAINNET: CHAIN.ZIRCUIT,
  SEI_MAINNET: CHAIN.SEI,
  ZEROG_MAINNET: CHAIN.OG,
  ABSTRACT_MAINNET: CHAIN.ABSTRACT,
  ARC_MAINNET: CHAIN.ARC,
  BERACHAIN_MAINNET: CHAIN.BERACHAIN,
  FLARE_MAINNET: CHAIN.FLARE,
  HYPEREVM_MAINNET: CHAIN.HYPERLIQUID,
  HYPERLIQUID_MAINNET: CHAIN.HYPERLIQUID, // HyperCore
  INK_MAINNET: CHAIN.INK,
  KATANA_MAINNET: CHAIN.KATANA,
  LIGHTLINK_MAINNET: CHAIN.LIGHTLINK_PHOENIX,
  MEGAETH_MAINNET: CHAIN.MEGAETH,
  MONAD_MAINNET: CHAIN.MONAD,
  MORPH_MAINNET: CHAIN.MORPH,
  PLASMA_MAINNET: CHAIN.PLASMA,
  ROBINHOOD_MAINNET: CHAIN.ROBINHOOD,
  RONIN_MAINNET: CHAIN.RONIN,
  ROOTSTOCK_MAINNET: CHAIN.ROOTSTOCK,
  SONEIUM_MAINNET: CHAIN.SONEIUM,
  SONIC_MAINNET: CHAIN.SONIC,
  SOPHON_MAINNET: CHAIN.SOPHON,
  STABLE_MAINNET: CHAIN.STABLE,
  TELOS_MAINNET: CHAIN.TELOS,
  TEMPO_MAINNET: CHAIN.TEMPO,
  UNICHAIN_MAINNET: CHAIN.UNICHAIN,
  BITCOIN_MAINNET: CHAIN.BITCOIN,
  SOLANA_MAINNET: CHAIN.SOLANA,
  ECLIPSE_MAINNET: CHAIN.ECLIPSE,
  STARKNET_MAINNET: CHAIN.STARKNET,
  PARADEX_MAINNET: CHAIN.PARADEX,
  TON_MAINNET: CHAIN.TON,
  TRON_MAINNET: CHAIN.TRON,
  FUEL_MAINNET: CHAIN.FUEL,
};

type FeedTx = { type: string; transaction_hash: string | null; timestamp?: string | null; amount_in_usd?: number | null };
type FeedSwap = {
  swap: {
    id: string;
    created_date: string;
    close_date: string;
    source_network: { name: string };
    destination_network: { name: string };
    transactions: FeedTx[];
  };
};

type Leg = { chain: string; isOutgoing: boolean; usd: number };

const toUnix = (value?: string | null) => (value ? Math.floor(new Date(value).getTime() / 1000) : NaN);

const prefetch = async (options: FetchOptions): Promise<Leg[]> => {
  const { startTimestamp, endTimestamp } = options;
  const legs: Leg[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const url = `${API}?statuses=1&compact=true&limit=${PAGE_SIZE}${cursor ? `&starting_after=${cursor}` : ""}`;
    const { data }: { data: FeedSwap[] } = await httpGet(url);
    if (!Array.isArray(data)) throw new Error(`layerswap: unexpected explorer response for ${url}`);
    if (!data.length) {
      if (page === 0) throw new Error("layerswap: explorer returned no completed swaps");
      return legs;
    }

    for (const { swap } of data) {
      const input = swap.transactions?.find((t) => t.type === "input" && t.transaction_hash);
      const output = swap.transactions?.find((t) => t.type === "output" && t.transaction_hash);
      const legsOfSwap: [FeedTx | undefined, string, boolean, number][] = [
        [input, swap.source_network?.name, true, toUnix(input?.timestamp ?? swap.created_date)],
        [output, swap.destination_network?.name, false, toUnix(output?.timestamp ?? swap.close_date)],
      ];
      for (const [tx, network, isOutgoing, ts] of legsOfSwap) {
        const chain = networks[network];
        if (!tx || !chain || !(ts >= startTimestamp && ts < endTimestamp) || !tx.amount_in_usd) continue;
        legs.push({ chain, isOutgoing, usd: tx.amount_in_usd });
      }
    }

    // pages are ordered by close date; a swap closed before the window has neither leg inside it
    const oldestClose = Math.min(...data.map(({ swap }) => toUnix(swap.close_date)));
    if (!Number.isFinite(oldestClose)) throw new Error("layerswap: explorer page has an invalid close_date");
    if (oldestClose < startTimestamp) return legs;
    cursor = data[data.length - 1].swap.id;
  }
  throw new Error(`layerswap: did not reach ${startTimestamp} within ${MAX_PAGES} pages`);
};

const fetch = async (options: FetchOptions) => {
  const legs = options.preFetchedResults as Leg[];
  const dailyOutgoingVolume = options.createBalances();
  const dailyIncomingVolume = options.createBalances();
  let dailyOutgoingTxCount = 0;
  let dailyIncomingTxCount = 0;

  for (const leg of legs) {
    if (leg.chain !== options.chain) continue;
    if (leg.isOutgoing) {
      dailyOutgoingVolume.addUSDValue(leg.usd);
      dailyOutgoingTxCount++;
    } else {
      dailyIncomingVolume.addUSDValue(leg.usd);
      dailyIncomingTxCount++;
    }
  }

  return { dailyOutgoingVolume, dailyIncomingVolume, dailyOutgoingTxCount, dailyIncomingTxCount };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  prefetch: prefetch as any,
  runAtCurrTime: true, // the explorer feed has no date filter, only the last 24h is paged
  chains: [...new Set(Object.values(networks))],
  methodology: {
    OutgoingVolume: "USD value of tokens users send into Layerswap swaps from each chain, as priced by Layerswap.",
    IncomingVolume: "USD value of tokens Layerswap delivers to users on each chain, as priced by Layerswap.",
    OutgoingTxCount: "Number of completed Layerswap swaps leaving each chain.",
    IncomingTxCount: "Number of completed Layerswap swaps arriving on each chain.",
  },
};

export default adapter;
