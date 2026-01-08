import fetchURL from "../utils/fetchURL"
import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";


const fetch = async (_: any) => {
  const allPools: any[] = [];
  let page = 1;
  let hasMore = true;
  const maxPoolsPerPage = 100;

  while (hasMore) {
    const response = await fetchURL(`https://swap.api.sui-prod.bluefin.io/api/v1/pools/info?page=${page}&limit=${maxPoolsPerPage}`);

    // Handle different response structures
    // If response is an array, use it directly
    // If response has a data property, use that
    const pools = Array.isArray(response) ? response : (response.data || response.pools || []);

    if (pools.length === 0) {
      hasMore = false;
      break;
    }

    allPools.push(...pools);

    // Check if there are more pages
    // If we got fewer than maxPoolsPerPage pools, we've reached the end
    if (pools.length < maxPoolsPerPage) {
      hasMore = false;
    } else {
      // Check for nextPage indicator in response
      const nextPage = response.nextPage || (response.data && response.data.nextPage);
      if (!nextPage) {
        hasMore = false;
      }
    }
    page++;
  }

  const rfqStats = await fetchURL("https://swap.api.sui-prod.bluefin.io/api/rfq/stats?interval=1d");

  let spotFees = 0;
  let spotRevenue = 0;

  for (const pool of allPools) {
    const poolFees = Number(pool.day.fee);
    spotFees += poolFees;

    // Use protocolFee from each pool instead of hardcoded 0.2
    // protocolFee is a decimal (e.g., 0.2 represents 20%)
    const protocolFee = pool.protocolFee ? Number(pool.protocolFee) : 0.2; // fallback to 0.2 if not present
    spotRevenue += poolFees * protocolFee;
  }

  const dailyRevenue = spotRevenue + Number(rfqStats.feesUsd);
  const dailyFees = spotFees + Number(rfqStats.feesUsd);

  const dailySupplySideRevenue = dailyFees - dailyRevenue;

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  chains: [CHAIN.SUI],
  fetch,
  start: '2024-11-19',
  runAtCurrTime: true,
  methodology: {
    Fees: "spot and rfq trading fees",
    Revenue: "protocol fees from spot and rfq trading",
    ProtocolRevenue: "protocol fees from spot and rfq trading",
    SupplySideRevenue: "fees earned by liquidity providers",
  }
};

export default adapter;
