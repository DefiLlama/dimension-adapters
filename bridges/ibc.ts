import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { postURL } from "../utils/fetchURL";

// IBC transfers between Cosmos zones, from Map of Zones (the source the old bridges server used): one row per zone and transfer,
// "Withdrawal" when the value leaves that zone and "Deposit" when it arrives, priced by Map of Zones (usd_value).
// https://mapofzones.com
const API = "https://api2.mapofzones.com/v1/graphql";
const PAGE_SIZE = 5000; // the API returns at most 5000 rows per request
// single transfers of $1M or more are not verifiable from the source and are dropped, as in the old adapter
const MAX_USD = 1_000_000;
// one account looping its own USDC between Osmosis and Noble since 2026-10-09 (~$250M a day each way), not bridging demand
const EXCLUDED_ADDRESSES = new Set([
  "osmo1ze3f954mtj30st8dw2qhylfvvtdv5q6x8zxxrj",
  "noble1ze3f954mtj30st8dw2qhylfvvtdv5q6x86q7dw",
  "cosmos1ze3f954mtj30st8dw2qhylfvvtdv5q6x0e4k4q",
]);

// Map of Zones zone id -> DefiLlama chain; zones with no DefiLlama chain are not tracked
// (gonka-mainnet, atomone-1, stratos-1, lava-mainnet-1, vota-ash, lumera-mainnet-1, beezee-1, colosseum-1, Neutaro-1, ...)
const ZONES: Record<string, string> = {
  "noble-1": CHAIN.NOBLE,
  "osmosis-1": CHAIN.OSMOSIS,
  "dydx-mainnet-1": CHAIN.DYDX,
  "phoenix-1": CHAIN.TERRA2,
  "columbus-5": CHAIN.TERRA, // Terra Classic
  "injective-1": CHAIN.INJECTIVE,
  "cosmoshub-4": CHAIN.COSMOS,
  "secret-4": CHAIN.SECRET,
  "axelar-dojo-1": CHAIN.AXELAR,
  "irishub-1": CHAIN.IRIS,
  "interwoven-1": CHAIN.INITIA,
  "akashnet-2": CHAIN.AKASH,
  "cronosmainnet_25-1": CHAIN.CRONOS,
  "stride-1": CHAIN.STRIDE,
  "celestia": CHAIN.CELESTIA,
  "zigchain-1": CHAIN.ZIGCHAIN,
  "kava_2222-10": CHAIN.KAVA,
  "agoric-3": CHAIN.AGORIC,
  "neutron-1": CHAIN.NEUTRON,
  "1": CHAIN.ETHEREUM,
  "bbn-1": CHAIN.BABYLON,
  "coreum-mainnet-1": CHAIN.COREUM,
  "xion-mainnet-1": CHAIN.XION,
  "dymension_1100-1": CHAIN.DYMENSION,
  "ssc-1": CHAIN.SAGA,
  "sentinelhub-2": CHAIN.SENTINEL,
  "core-1": CHAIN.PERSISTENCE,
  "seda-1": CHAIN.SEDA,
  "gravity-bridge-3": CHAIN.GRAVITYBRIDGE,
  "pio-mainnet-1": CHAIN.PROVENANCE,
  "cheqd-mainnet-1": CHAIN.CHEQD,
  "haqq_11235-1": CHAIN.HAQQ,
  "juno-1": CHAIN.JUNO,
  "dimension_37-1": CHAIN.XPLA,
  "panacea-3": CHAIN.MEDIBLOC,
  "pirin-1": CHAIN.NOLUS,
  "nyx": CHAIN.NYM,
  "mantra-1": CHAIN.MANTRA,
  "fetchhub-4": CHAIN.FETCHHUB,
  "allora-mainnet-1": CHAIN.ALLORA,
  "Oraichain": CHAIN.ORAI,
  "shentu-2.2": CHAIN.SHENTU,
  "dungeon-1": CHAIN.DUNGEON,
  "regen-1": CHAIN.REGEN,
  "kyve-1": CHAIN.KYVE,
  "chihuahua-1": CHAIN.CHIHUAHUA,
  "archway-1": CHAIN.ARCHWAY,
  "realionetwork_3301-1": CHAIN.REALIO,
  "laozi-mainnet": CHAIN.BAND,
  "passage-2": CHAIN.PASSAGE,
  "jackal-1": CHAIN.JACKAL,
  "sommelier-3": CHAIN.SOMMELIER,
  "carbon-1": CHAIN.CARBON,
  "cataclysm-1": CHAIN.NIBIRU,
};

type Transfer = { zone: string; tx_type: string; usd_value: number; source_address: string; destination_address: string };

const query = async (q: string) => {
  const res = await postURL(API, { query: q });
  if (res.errors) throw new Error(`ibc: Map of Zones error ${JSON.stringify(res.errors).slice(0, 200)}`);
  return res.data;
};

const toIso = (timestamp: number) => new Date(timestamp * 1000).toISOString().slice(0, 19); // the API stores UTC without a zone suffix

// one paged pull per day, shared by every chain
const prefetch = async (options: FetchOptions): Promise<Transfer[]> => {
  // the source must have indexed the whole day, or the missing hours would be stored as zero
  const latest = (await query(`{ ibc_transfer_txs(order_by: {timestamp: desc}, limit: 1) { timestamp } }`)).ibc_transfer_txs[0]?.timestamp;
  if (!latest || Date.parse(`${latest}Z`) / 1000 < options.endTimestamp) throw new Error(`ibc: Map of Zones has only indexed up to ${latest}`);

  const transfers: Transfer[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page: Transfer[] = (await query(`{
      ibc_transfer_txs(
        where: { timestamp: { _gte: "${toIso(options.startTimestamp)}", _lt: "${toIso(options.endTimestamp)}" }, status: { _eq: "Success" }, usd_value: { _gt: 0, _lt: ${MAX_USD} } }
        order_by: [{ timestamp: asc }, { tx_hash: asc }, { zone: asc }, { tx_type: asc }]
        limit: ${PAGE_SIZE}
        offset: ${offset}
      ) { zone tx_type usd_value source_address destination_address }
    }`)).ibc_transfer_txs;
    transfers.push(...page.filter((t) => !EXCLUDED_ADDRESSES.has(t.source_address) && !EXCLUDED_ADDRESSES.has(t.destination_address)));
    if (page.length < PAGE_SIZE) break;
  }
  return transfers;
};

const fetch = async (options: FetchOptions) => {
  const transfers: Transfer[] = options.preFetchedResults;
  const dailyOutgoingVolume = options.createBalances();
  const dailyIncomingVolume = options.createBalances();
  let dailyOutgoingTxCount = 0;
  let dailyIncomingTxCount = 0;

  for (const t of transfers) {
    if (ZONES[t.zone] !== options.chain) continue;
    if (t.tx_type === "Withdrawal") {
      dailyOutgoingVolume.addUSDValue(t.usd_value);
      dailyOutgoingTxCount++;
    } else if (t.tx_type === "Deposit") {
      dailyIncomingVolume.addUSDValue(t.usd_value);
      dailyIncomingTxCount++;
    }
  }

  return { dailyOutgoingVolume, dailyIncomingVolume, dailyOutgoingTxCount, dailyIncomingTxCount };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  prefetch: prefetch as any,
  chains: [...new Set(Object.values(ZONES))],
  methodology: {
    OutgoingVolume: "USD value of successful IBC transfers leaving each chain, as indexed and priced by Map of Zones. Single transfers of $1M or more and one account looping USDC between Osmosis and Noble are excluded.",
    IncomingVolume: "USD value of successful IBC transfers arriving on each chain, as indexed and priced by Map of Zones. Single transfers of $1M or more and one account looping USDC between Osmosis and Noble are excluded.",
    OutgoingTxCount: "Number of successful IBC transfers leaving each chain.",
    IncomingTxCount: "Number of successful IBC transfers arriving on each chain.",
  },
};

export default adapter;
