import ADDRESSES from '../../helpers/coreAssets.json'
import { CHAIN } from "../../helpers/chains";
import postURL from "../../utils/fetchURL";
import fetchURL from "../../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";

const endpoint = "https://api.ston.fi/v1/stats/operations?";

const fetchFees = async (options: FetchOptions) => {
  const pool_list = (await fetchURL("https://api.ston.fi/v1/pools")).pool_list;
  const poolsByAddress = {};
  // store pools info for each asset to calculate weigthed price later
  const asset2pools = {};
  const add_pool = (address: string, tvl: number, reserve: number) => {
    if (!asset2pools[address]) {
      asset2pools[address] = [];
    }
    asset2pools[address].push({ tvl, reserve });
  };
  for (const pool of pool_list) {
    poolsByAddress[pool.address] = pool;
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

  // go through all operations and calculate fees based on the current prices and pool fee rates
  for (const item of res["operations"]) {
    const operation = item.operation;
    if (
      !operation.success ||
      operation.operation_type != "swap" ||
      (operation.exit_code != "swap_ok" && operation.exit_code != "swap_ok_ref")
    ) continue;

    const pool = poolsByAddress[operation.pool_address];
    const asset0Price = asset_prices[operation.asset0_address];
    const asset1Price = asset_prices[operation.asset1_address];
    if (!pool || !asset0Price || !asset1Price) continue;

    const volumeUsd = Math.max(
      Math.abs(Number(operation.asset0_amount)) * asset0Price,
      Math.abs(Number(operation.asset1_amount)) * asset1Price,
    );
    if (!Number.isFinite(volumeUsd) || volumeUsd <= 0) continue;

    total_lp_fees += volumeUsd * (Number(pool.lp_fee) / 10000);
    total_protocol_fees += volumeUsd * (Number(pool.protocol_fee) / 10000);
  }

  return {
    dailyUserFees: total_lp_fees + total_protocol_fees,
    dailyFees: total_lp_fees + total_protocol_fees,
    dailySupplySideRevenue: total_lp_fees,
    dailyRevenue: total_protocol_fees,
  };
};

const adapter: SimpleAdapter = {
  methodology: {
    Fees: "User pays fee on each swap. Fees go to the protocol and LPs.",
    UserFees: "User pays fee on each swap. Fees go to the protocol and LPs.",
    Revenue: "Protocol share of swap fees, calculated from the pool protocol fee bps.",
    SupplySideRevenue: "LP share of swap fees, calculated from the pool LP fee bps.",
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
