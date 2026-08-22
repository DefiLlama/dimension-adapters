import fetchURL from "../utils/fetchURL"
import { FetchResultFees, SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const ember_fees_url="https://vaults.api.sui-prod.bluefin.io/api/v2/vaults/fees"

const fetch = async (options: FetchOptions): Promise<FetchResultFees> => {
  // endTimestampInMs is inclusive on the API side, and fees arrive as one discrete
  // accrual event at 00:00 UTC. runAdapter hands us endTimestamp = midnight, which
  // lands exactly on the next day's event, so a day window returns two events and
  // books roughly double. Live runs escape it only because that event does not
  // exist yet when the job fires; a backfill of a past day does not. Shave a
  // millisecond off so the upper bound is effectively exclusive.
  const result= await fetchURL(`${ember_fees_url}?startTimestampInMs=${options.startTimestamp*1000}&endTimestampInMs=${options.endTimestamp*1000-1}`);
  const feesUsdE9=result.feesUsdE9;
  const revenueUsdE9=result.revenueUsdE9;

  const fees = Number(feesUsdE9) / 1e9;
  const revenue = Number(revenueUsdE9) / 1e9;
  
  return {
    dailyFees: fees,
    dailyRevenue: revenue,
    dailyProtocolRevenue: revenue,
    dailySupplySideRevenue: fees - revenue,
  };
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.SUI],
  start: '2025-09-01',
  methodology: {
    Fees: 'Total yields collected from Ember protocol vaults.',
    Revenue: 'Share of yields to Ember protocol.',
    ProtocolRevenue: 'Share of yields to Ember protocol.',
    SupplySideRevenue: 'Share of yields to vaults depositors.',
  }
};

export default adapter;
