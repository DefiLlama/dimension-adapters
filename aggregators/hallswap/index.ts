import { httpGet } from "../../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { isCoreAsset } from "../../helpers/prices";
import { getContractTxs, getContractWasmEvents, getExplorerIndexedUntilMs } from "../../helpers/injectiveExplorer";

const INJECTIVE_ROUTER = "inj16lkekzp36vj6a9zjl778a2s5nd9f6ft67w2e90";

const API_URL = "https://api.seer.coinhall.org/api/hallswap/metrics";
const API_CHAINS_DEAD_FROM = "2025-10-29";

// Map of the chain names used by defillama to the chain names used by hallswap
const API_CHAINS: Record<string, string> = {
  [CHAIN.ARCHWAY]: "archway",
  [CHAIN.CHIHUAHUA]: "chihuahua",
  [CHAIN.DYMENSION]: "dymension",
  [CHAIN.JUNO]: "juno",
  [CHAIN.KUJIRA]: "kujira",
  [CHAIN.MIGALOO]: "migaloo",
  [CHAIN.NEUTRON]: "neutron",
  [CHAIN.ORAI]: "oraichain",
  [CHAIN.OSMOSIS]: "osmosis",
  [CHAIN.SEI]: "sei",
  [CHAIN.SOLANA]: "solana",
  // terra: "terraclassic",
  [CHAIN.TERRA2]: "terra",
};

const fetchFromApi = async (options: FetchOptions) => {
  const chain = API_CHAINS[options.chain];
  const res = await httpGet(`${API_URL}?chains=${chain}&from=${options.fromTimestamp * 1_000}&to=${options.toTimestamp * 1_000}`, { timeout: 60_000 });
  if (res?.[chain] === undefined || res[chain] === null) throw new Error(`hallswap: no ${chain} volume in the api response`);
  return { dailyVolume: res[chain] };
};

const fetchInjective = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  // half-open window [startTimestamp, endTimestamp)
  const fromMs = options.startTimestamp * 1000;
  const toMs = options.endTimestamp * 1000;

  const indexedUntil = await getExplorerIndexedUntilMs();
  if (indexedUntil < toMs) {
    throw new Error(`hallswap: explorer has only indexed until ${new Date(indexedUntil).toISOString()}, window ends ${new Date(toMs).toISOString()}`);
  }

  for (const tx of await getContractTxs(INJECTIVE_ROUTER, fromMs, toMs)) {
    if (Number(tx.code ?? 0) !== 0) continue; // failed tx
    for (const swap of getContractWasmEvents(tx, INJECTIVE_ROUTER)) {
      if (!swap.hallswap) continue;
      // count the core asset side when there is one, otherwise the input side
      const offerToken = swap.offer_asset.replace(/^erc20:/, "");
      const returnToken = swap.return_asset.replace(/^erc20:/, "");
      const useReturn = !isCoreAsset(CHAIN.INJECTIVE, offerToken) && isCoreAsset(CHAIN.INJECTIVE, returnToken);
      const token = useReturn ? returnToken : offerToken;
      const amount = useReturn ? swap.return_amount : swap.offer_amount;
      // "inj" is the native INJ denom; "erc20:0x.." is the bank form of an EVM token; cw20, ibc, peggy and factory denoms are used as-is
      if (token === "inj") dailyVolume.addGasToken(amount);
      else dailyVolume.add(token, amount);
    }
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.INJECTIVE]: { fetch: fetchInjective, start: '2024-03-27' }, // router deployment
    ...Object.fromEntries(Object.keys(API_CHAINS).map((chain) => [chain, {
      fetch: fetchFromApi,
      start: '2021-12-01', // The first launch of Hallswap (1st December 2021)
      deadFrom: API_CHAINS_DEAD_FROM,
    }])),
  },
  methodology: {
    Volume: "Value of swaps routed through the Hallswap router, counted once per swap on the major-token side. Injective is read from the router's on-chain swap events; the other chains came from the Coinhall API and are no longer tracked after October 2025.",
  },
};

export default adapter;
