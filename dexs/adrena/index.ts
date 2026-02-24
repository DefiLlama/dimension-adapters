import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const apiEndpoint = (fromTimestamp: number, toTimestamp: number) => {
  let url = `https://datapi.adrena.trade/poolinfodaily?start_date=${new Date(fromTimestamp * 1000).toISOString()}&end_date=${new Date(toTimestamp * 1000).toISOString()}`;
  url += '&cumulative_referrer_fee_usd=true';
  url += '&cumulative_swap_fee_usd=true';
  url += '&cumulative_liquidity_fee_usd=true';
  url += '&cumulative_close_position_fee_usd=true';
  url += '&cumulative_liquidation_fee_usd=true';
  url += '&cumulative_borrow_fee_usd=true';
  url += '&cumulative_trading_volume_usd=true';
  return url;
}

async function fetch(_a: any, _b: any, options: FetchOptions) {
  const apiRes = await httpGet(apiEndpoint(options.fromTimestamp, options.toTimestamp))
  
  const dailyVolume = apiRes.data.cumulative_trading_volume_usd[1] - apiRes.data.cumulative_trading_volume_usd[0]; 
  
  const cumulative_swap_fee_usd = apiRes.data.cumulative_swap_fee_usd[1] - apiRes.data.cumulative_swap_fee_usd[0];
  const cumulative_liquidity_fee_usd = apiRes.data.cumulative_liquidity_fee_usd[1] - apiRes.data.cumulative_liquidity_fee_usd[0];
  const cumulative_referrer_fee_usd = apiRes.data.cumulative_referrer_fee_usd[1] - apiRes.data.cumulative_referrer_fee_usd[0];
  const cumulative_close_position_fee_usd = apiRes.data.cumulative_close_position_fee_usd[1] - apiRes.data.cumulative_close_position_fee_usd[0];
  const cumulative_liquidation_fee_usd = apiRes.data.cumulative_liquidation_fee_usd[1] - apiRes.data.cumulative_liquidation_fee_usd[0];
  const cumulative_borrow_fee_usd = apiRes.data.cumulative_borrow_fee_usd[1] - apiRes.data.cumulative_borrow_fee_usd[0];
  
  const dailyFees = cumulative_swap_fee_usd
    + cumulative_liquidity_fee_usd
    + cumulative_referrer_fee_usd
    + cumulative_close_position_fee_usd
    + cumulative_liquidation_fee_usd
    + cumulative_borrow_fee_usd;

  const dailySupplySideRevenue = dailyFees * 0.7
  const dailyRevenue = dailyFees - dailySupplySideRevenue;
  
  return {
    dailyVolume,
    dailyFees,
    dailySupplySideRevenue,
    dailyRevenue: dailyRevenue,
    dailyHoldersRevenue: dailyRevenue,
    dailyProtocolRevenue: 0,
  }
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.SOLANA]: {
      start: '2024-11-18',
    }
  },
  fetch,
  methodology: {
    Volumes: 'Sum of all open/close/increase/liquidate position volumes.',
    Fees: 'All fees accrued by liquidity pools.',
    Revenue: '20% to gov token holder, 10% to buyback gov token, 0% to protocol.',
    SupplySideRevenue: "70% to pool token holders.",
    HoldersRevenue: '20% to gov token holder, 10% to buyback gov token, 0% to protocol.',
  },
}

export default adapter;
