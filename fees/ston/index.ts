import ADDRESSES from '../../helpers/coreAssets.json'
import { CHAIN } from "../../helpers/chains";
import postURL from "../../utils/fetchURL";
import fetchURL from "../../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";

const endpoint = "https://api.ston.fi/v1/stats/operations?";

const TRUSTED_POOL_MIN_TVL_USD = 1000;
// LP fee or protocol+referral fee should never exceed 5% of the side it's taken from.
// Typical LP fee is 0.2-0.3%; 5% is wildly generous, so anything above that is corrupt.
const MAX_FEE_FRACTION = 0.05;

const fetchFees = async (options: FetchOptions) => {
  const pool_list = (await fetchURL("https://api.ston.fi/v1/pools")).pool_list;

  const asset2pools: Record<string, Array<{ tvl: number; reserve: number }>> = {};
  const trustedPools = new Set<string>();

  for (const pool of pool_list) {
    if (pool["lp_total_supply_usd"] < TRUSTED_POOL_MIN_TVL_USD) continue;

    const tvl = Number(pool["lp_total_supply_usd"]);
    const r0 = Number(pool["reserve0"]);
    const r1 = Number(pool["reserve1"]);
    if (!asset2pools[pool["token0_address"]]) asset2pools[pool["token0_address"]] = [];
    if (!asset2pools[pool["token1_address"]]) asset2pools[pool["token1_address"]] = [];
    asset2pools[pool["token0_address"]].push({ tvl: tvl / 2, reserve: r0 });
    asset2pools[pool["token1_address"]].push({ tvl: tvl / 2, reserve: r1 });

    const addr: string | undefined = pool["address"];
    if (addr) trustedPools.add(addr);
  }

  const asset_prices: Record<string, number> = {};
  for (const asset in asset2pools) {
    const pools = asset2pools[asset];
    const totalTvl = pools.reduce((acc, p) => acc + p.tvl, 0);
    const totalReserve = pools.reduce((acc, p) => acc + p.reserve, 0);
    asset_prices[asset] = totalReserve > 0 ? totalTvl / totalReserve : 0;
  }
  // pTON price tracks TON
  asset_prices["EQCM3B12QK1e4yZSf8GtBRT0aLMNyEsBc_DhVfRRtOEffLez"] =
    asset_prices[ADDRESSES.ton.TON_3];

  const startTime = new Date(options.startTimestamp * 1000).toISOString().split(".")[0];
  const endTime = new Date(options.endTimestamp * 1000).toISOString().split(".")[0];
  const res = await postURL(`${endpoint}since=${startTime}&until=${endTime}`);

  let total_lp_fees = 0;
  let total_protocol_fees = 0;
  let referral_fees = 0;

  for (const item of res["operations"]) {
    const op = item.operation;
    if (!op.success || op.operation_type !== "swap" || op.exit_code !== "swap_ok") continue;

    const poolAddress: string | undefined = op.pool_address;
    if (!poolAddress || !trustedPools.has(poolAddress)) continue;

    // Operation reports asset0/asset1 with signed amounts:
    //   amount > 0 = into pool  = swap INPUT
    //   amount < 0 = out of pool = swap OUTPUT
    // fee_asset_address is the OUTPUT asset (matches whichever side is negative).
    const a0 = op.asset0_address;
    const a1 = op.asset1_address;
    const a0Amount = Number(op.asset0_amount ?? 0);
    const a1Amount = Number(op.asset1_amount ?? 0);
    if (!a0 || !a1) continue;

    let inAsset: string;
    let outAsset: string;
    let inAmount: number;
    let outAmount: number;
    if (a0Amount > 0 && a1Amount < 0) {
      inAsset = a0; outAsset = a1; inAmount = a0Amount; outAmount = -a1Amount;
    } else if (a1Amount > 0 && a0Amount < 0) {
      inAsset = a1; outAsset = a0; inAmount = a1Amount; outAmount = -a0Amount;
    } else {
      continue;
    }

    const lpFeeRaw = Number(op.lp_fee_amount) || 0;
    const protocolFeeRaw = Number(op.protocol_fee_amount) || 0;
    const referralFeeRaw = Number(op.referral_fee_amount) || 0;

    // Sanity caps: realistic fees are 0.2-0.3% of the side they're taken from;
    // 5% is the corrupt-data threshold. lp_fee_amount is denominated in INPUT,
    // protocol_fee_amount + referral_fee_amount in OUTPUT (= fee_asset_address).
    if (inAmount > 0 && lpFeeRaw > inAmount * MAX_FEE_FRACTION) continue;
    if (outAmount > 0 && (protocolFeeRaw + referralFeeRaw) > outAmount * MAX_FEE_FRACTION) continue;

    const inPrice = asset_prices[inAsset];
    const outPrice = asset_prices[outAsset];
    if (inPrice == null || outPrice == null) continue;

    // Correct denominations:
    //   lp_fee_amount     -> input asset price
    //   protocol_fee_amount, referral_fee_amount -> output (fee_asset) price
    total_lp_fees += lpFeeRaw * inPrice;
    total_protocol_fees += protocolFeeRaw * outPrice;
    referral_fees += referralFeeRaw * outPrice;
  }

  return {
    dailyUserFees: total_lp_fees + total_protocol_fees + referral_fees,
    dailyFees: total_lp_fees + total_protocol_fees + referral_fees,
    dailySupplySideRevenue: total_lp_fees + referral_fees,
    dailyRevenue: total_protocol_fees,
  };
};

const adapter: SimpleAdapter = {
  methodology: {
    Fees: "User pays fee on each swap. Fees go to the protocol, LPs and optionally to the referral address.",
    UserFees: "User pays fee on each swap. Fees go to the protocol, LPs and optionally to the referral address.",
    Revenue: "Protocol receives 1/3 of fees paid by users (not including referral fees).",
    SupplySideRevenue: "2/3 of user fees are distributed among LPs and referral fees.",
  },
  version: 2,
  adapter: {
    [CHAIN.TON]: {
      start: '2023-11-14',
      fetch: fetchFees,
    },
  },
};
export default adapter;
