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

  let spotFees = 0;
  let spotRevenue = 0;

  for (const pool of allPools) {
    const poolFees = Number(pool.day.fee);
    spotFees += poolFees;

    const protocolFee = pool.protocolFee ? Number(pool.protocolFee) : 0.2;
    spotRevenue += poolFees * protocolFee;
  }

  const dailyRevenue = spotRevenue;
  const dailyFees = spotFees;

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
    Fees: "Swap fees collected from Bluefin CLMM spot pools",
    Revenue: "Protocol's share of CLMM swap fees (per-pool protocolFee, defaulting to 20%)",
    ProtocolRevenue: "Protocol's share of CLMM swap fees retained by Bluefin",
    SupplySideRevenue: "Remaining CLMM swap fees distributed to liquidity providers",
  }
};

export default adapter;
