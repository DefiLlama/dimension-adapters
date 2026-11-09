import fetchURL, { httpGet } from "../../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// OroSwap is an AMM DEX on ZIGChain. The pool-manager endpoint exposes a
// per-pool `fees24H` (USD); there is no aggregate fees field, so we sum them.
// The mainnet host is header-gated (403 without a browser UA + Origin), which
// httpGet can satisfy; this is a header check, not a Cloudflare challenge.
const POOLS_URL = "https://api-mainnet.oroswap.org/api/poolmanager/pools?offset=0&limit=1000";
const HEADERS = {
  "User-Agent": "Mozilla/5.0",
  Origin: "https://app.oroswap.org",
};
const FACTORY = "zig1xx3aupmgv3ce537c0yce8zzd3sz567syaltr2tdehu3y803yz6gsc6tz85";
const BPS_DENOM = 10_000;

// CosmWasm PairType JSON: { xyk: {} } | { stable: {} } | { custom: "xyk_25" }
const pairTypeKey = (pairType: any): string => {
  if (!pairType || typeof pairType !== "object") {
    throw new Error(`OroSwap: missing pair_type (${JSON.stringify(pairType)})`);
  }
  const keys = Object.keys(pairType);
  if (keys.length !== 1) {
    throw new Error(`OroSwap: malformed pair_type ${JSON.stringify(pairType)}`);
  }
  const kind = keys[0];
  return kind === "custom" ? `custom:${pairType.custom}` : kind;
};

const fetch = async (options: FetchOptions) => {
  const query = btoa(JSON.stringify({ config: {} }));
  const [data, factoryConfig] = await Promise.all([
    httpGet(POOLS_URL, { headers: HEADERS }),
    fetchURL(`https://api.zigchain.com/cosmwasm/wasm/v1/contract/${FACTORY}/smart/${query}`),
  ]);

  const pairConfigs: any[] = factoryConfig?.data?.pair_configs;
  if (!Array.isArray(pairConfigs) || !pairConfigs.length) {
    throw new Error("OroSwap: factory config missing pair_configs");
  }

  // maker_fee_bps is the share of swap fees sent to the Maker (protocol), not
  // the swap fee itself. 2000 = 20% protocol / 80% LPs.
  const makerShareByType = new Map<string, number>();
  for (const cfg of pairConfigs) {
    const key = pairTypeKey(cfg?.pair_type);
    const makerBps = Number(cfg?.maker_fee_bps);
    if (!Number.isFinite(makerBps) || makerBps < 0 || makerBps > BPS_DENOM) {
      throw new Error(`OroSwap: invalid maker_fee_bps (${cfg?.maker_fee_bps}) for ${key}`);
    }
    makerShareByType.set(key, makerBps / BPS_DENOM);
  }

  const pools = [...(data?.xyk ?? []), ...(data?.custom ?? [])];
  if (!pools.length) throw new Error("OroSwap: no pools returned");

  const dailyFees = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  for (const pool of pools) {
    const name = pool?.details?.poolName ?? pool?.pair_contract_addr ?? "?";
    const raw = pool?.details?.fees24H;
    // Fail closed on a malformed pool rather than treating it as zero fees.
    if (raw === null || raw === undefined || raw === "") {
      throw new Error(`OroSwap: missing fees24H for pool ${name}`);
    }
    const fees = Number(raw);
    if (!Number.isFinite(fees)) {
      throw new Error(`OroSwap: non-numeric fees24H (${raw}) for pool ${name}`);
    }

    const key = pairTypeKey(pool?.pair?.pair_type);
    const makerShare = makerShareByType.get(key);
    if (makerShare === undefined) {
      throw new Error(`OroSwap: no factory pair_config matching pair_type ${key} (pool ${name})`);
    }

    const protocolFees = fees * makerShare;
    const lpFees = fees - protocolFees;

    dailyFees.addUSDValue(fees, METRIC.SWAP_FEES);
    dailyProtocolRevenue.addUSDValue(protocolFees, METRIC.PROTOCOL_FEES);
    dailySupplySideRevenue.addUSDValue(lpFees, METRIC.LP_FEES);
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Sum of the trailing-24h swap fees across OroSwap's pools (per-pool fees24H, USD), from the OroSwap pool-manager API.",
  UserFees: "All swap fees are paid by the traders.",
  Revenue: "Share of swap fees sent to the Maker contract (maker_fee_bps / 10000), matched per pool by pair_type against the factory pair_configs.",
  ProtocolRevenue: "Same as Revenue: maker_fee_bps of each pool's swap fees, retained by the protocol.",
  SupplySideRevenue: "Remainder of swap fees (1 - maker_fee_bps / 10000) paid to liquidity providers.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Trailing-24h swap fees charged on OroSwap pools.",
  },
  UserFees: {
    [METRIC.SWAP_FEES]: "Traders pay the full swap fee.",
  },
  Revenue: {
    [METRIC.PROTOCOL_FEES]: "maker_fee_bps share of swap fees collected by the Maker contract.",
  },
  ProtocolRevenue: {
    [METRIC.PROTOCOL_FEES]: "maker_fee_bps share of swap fees collected by the Maker contract.",
  },
  SupplySideRevenue: {
    [METRIC.LP_FEES]: "Swap fees remaining after the maker_fee_bps protocol cut, paid to LPs.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ZIGCHAIN]: {
      fetch,
      // The endpoint only exposes a rolling 24h snapshot, so run at current time.
      runAtCurrTime: true,
      start: "2025-09-27", // earliest OroSwap pool
    },
  },
  methodology,
  breakdownMethodology,
};

export default adapter;
