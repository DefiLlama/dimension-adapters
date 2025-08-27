import ADDRESSES from '../../helpers/coreAssets.json'
import { CHAIN } from "../../helpers/chains";
import postURL from "../../utils/fetchURL";
import fetchURL from "../../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";

const endpoint = "https://api.ston.fi/v1/stats/operations?";

const fetchFees = async (options: FetchOptions) => {
  const pool_list = (await fetchURL("https://api.ston.fi/v1/pools")).pool_list;
  // store pools info for each asset to calculate weigthed price later
  const asset2pools = {};
  const add_pool = (address: string, tvl: number, reserve: number) => {
    if (!asset2pools[address]) {
      asset2pools[address] = [];
    }
    asset2pools[address].push({ tvl, reserve });
  };
  for (const pool of pool_list) {
    // ignore pools with low liquidity
    if (pool["lp_total_supply_usd"] < 1000) {
      continue;
    }
    add_pool(pool["token0_address"], Number(pool["lp_total_supply_usd"]) / 2, Number(pool["reserve0"]));
    add_pool(pool["token1_address"], Number(pool["lp_total_supply_usd"]) / 2, Number(pool["reserve1"]));
  }
  // price is calculated as total tvl / total reserve across all pools
  const asset_prices = {};
  for (const asset in asset2pools) {
    const pools = asset2pools[asset];
    const price =
      pools.map((pool) => pool.tvl).reduce((a, b) => a + b, 0) /
      pools.map((pool) => pool.reserve).reduce((a, b) => a + b, 0);
    asset_prices[asset] = price;
  }
  // explicitly set price for pTON based on TON price
  asset_prices["EQCM3B12QK1e4yZSf8GtBRT0aLMNyEsBc_DhVfRRtOEffLez"] =
    asset_prices[ADDRESSES.ton.TON_3];

  const startTime = new Date(options.startTimestamp * 1000).toISOString().split(".")[0];
  const endTime = new Date(options.endTimestamp * 1000).toISOString().split(".")[0];
  const res = await postURL(`${endpoint}since=${startTime}&until=${endTime}`);

  let total_lp_fees = 0;
  let total_protocol_fees = 0;
  let referral_fees = 0;

  // go through all operations and calculate fees based on the current prices
  for (const item of res["operations"]) {
    const operation = item.operation;
    if (operation.success && operation.operation_type == "swap" && operation.exit_code == "swap_ok") {
      if (operation.fee_asset_address in asset_prices) {
        const price = asset_prices[operation.fee_asset_address];
        total_lp_fees += operation.lp_fee_amount * price;
        total_protocol_fees += operation.protocol_fee_amount * price;
        referral_fees += (operation.referral_fee_amount || 0) * price;
      } else {
        continue;
      }
    }
  }

  return {
    dailyUserFees: total_lp_fees + total_protocol_fees + referral_fees,
    dailyFees: total_lp_fees + total_protocol_fees + referral_fees,
    dailySupplySideRevenue: total_lp_fees,
    dailyRevenue: total_protocol_fees,
  };
};

const adapter: SimpleAdapter = {
  methodology: {
    UserFees: "User pays fee on each swap. Fees go to the protocol, LPs and optinally to the referral address.",
    Revenue: "Protocol receives 1/3 of fees paid by users (not including referral fees).",
    SupplySideRevenue: "2/3 of user fees are distributed among LPs (not including referral fees).",
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
