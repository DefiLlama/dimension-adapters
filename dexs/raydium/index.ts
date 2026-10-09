import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import fetchURL from "../../utils/fetchURL"
import * as sdk from "@defillama/sdk"
import PromisePool from "@supercharge/promise-pool";


const fetch = async (options: FetchOptions) => {
  const ammPoolStandard: any[] = [];
  let page = 1;

  let ammFee = 0
  let clmmFee = 0
  let cpmmFee = 0
  let dailyVolumeAmmPool = 0
  let totalPoolCount = 0
  let validPoolCount = 0
  let hasMore = true
  const pullChunkSize = 21

  while (hasMore) {

    const { errors } = await PromisePool
      .withConcurrency(pullChunkSize)
      .for(Array.from({ length: pullChunkSize }))
      .process(async (_: any, index: number) => {
        const response = await fetchURL(`https://api-v3.raydium.io/pools/info/list?poolType=all&poolSortField=volume24h&sortType=desc&pageSize=1000&page=${page + index}`)
        const data = response.data.data
        const validPoolCount = addPoolData(data)
        if (data.length === 0) {
          hasMore = false
        }
        /* if (data.length) {
          const highestTvl = data.reduce((a: any, b: any) => Math.max(a, Number(b.tvl)), 0)
          const highestVolume = data.reduce((a: any, b: any) => Math.max(a, Number(b.day.volume)), 0)
          const lowestTvl = data.reduce((a: any, b: any) => Math.min(a, Number(b.tvl)), 0)
          const lowestVolume = data.reduce((a: any, b: any) => Math.min(a, Number(b.day.volume)), 0)
          sdk.log(`page: ${page + index} and highestTvl: ${highestTvl} and lowestTvl: ${lowestTvl} and highestVolume: ${highestVolume} and lowestVolume: ${lowestVolume} and validPools: ${validPoolCount} and all pools: ${data.length}`);
        } */
      })

    if (errors?.length) throw errors

    page += pullChunkSize
    sdk.log(`page: ${page} and valid pools: ${validPoolCount} and all pools: ${totalPoolCount}`);
    await new Promise(r => setTimeout(r, 3000)) // 3s between chunks to avoid rate limits
  }

  function addPoolData(ammPoolStandard: any[]) {
    const validPools = ammPoolStandard.filter((i: any) => ((Number(i.tvl) > 10_000) || (Number(i.feeRate) > 0.001)));
    dailyVolumeAmmPool += validPools.reduce((a: number, b) => a + b.day.volume, 0)
    for (const item of validPools) {
      if (item.programId === 'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK') clmmFee += item.day.volumeFee
      else if (item.programId === 'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C') cpmmFee += item.day.volumeFee
      else ammFee += item.day.volumeFee
    }
    validPoolCount += validPools.length
    totalPoolCount += ammPoolStandard.length
    return validPools.length
  }
  sdk.log(`total pages: ${page} and valid pools: ${validPoolCount} and all pools: ${totalPoolCount}`);

  const totalFees = ammFee + clmmFee + cpmmFee; // Total fees paid by users

  // Protocol Revenue (Treasury)
  // AMM: 0%, CLMM: 4%, CPMM: 4%
  const treasuryFees = (clmmFee + cpmmFee) * 0.04;

  // Holders Revenue (Buybacks)
  // AMM: 12%, CLMM: 12%, CPMM: 12%
  const buybackFees = totalFees * 0.12;

  // Supply Side Revenue (LPs) = Total Fees - Treasury - Buybacks
  const lpFees = totalFees - treasuryFees - buybackFees;

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  dailyFees.addUSDValue(totalFees, METRIC.SWAP_FEES);
  dailyRevenue.addUSDValue(treasuryFees, METRIC.PROTOCOL_FEES);
  dailyRevenue.addUSDValue(buybackFees, METRIC.TOKEN_BUY_BACK);
  dailyProtocolRevenue.addUSDValue(treasuryFees, METRIC.PROTOCOL_FEES);
  dailyHoldersRevenue.addUSDValue(buybackFees, METRIC.TOKEN_BUY_BACK);
  dailySupplySideRevenue.addUSDValue(lpFees, METRIC.LP_FEES);

  // // const buyRay = await postURL('https://explorer-api.mainnet-beta.solana.com/', JSON.stringify({
  // const buyRay = await postURL('https://api.mainnet-beta.solana.com', JSON.stringify({
  //   "jsonrpc": "2.0",
  //   "id": 123,
  //   "method": "getMultipleAccounts",
  //   "params": [
  //     [
  //       "G7rxL8ySm5qPbtTus9FhAn2nEAZn8DDsUEeHGXgWTP1x",
  //       "BnTSNB2VqsUGiauSfwfyQBdFwPYnteb1M69Y1VXziP5u",
  //       "FpDWkidnRD6pWzYZAnDWEU3kC1hXSmQSqhd9w4nMCn1",
  //       "E5BMFn1mzTGuFWzNHZ7cybWfzetmqhFKS7SM91N5WePU",
  //       "BEVT2yGq2rvvPCnMipktFWxJaouidExC7scW9GHhMuzi",
  //     ],
  //     {
  //       "encoding": "jsonParsed"
  //     }
  //   ]
  // }), 3, {headers: {'content-type': 'application/json'}})

  // const buyRayAll = buyRay.result.value.map((i: any) => i?.data?.parsed?.info?.tokenAmount?.uiAmount ?? 0).reduce((a: number,b: number) => a + b, 0)

  // const rayPrice = (await fetchURL('https://api-v3.raydium.io/mint/price?mints=4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R'))?.data['4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R'] ?? 0

  return {
    dailyVolume: dailyVolumeAmmPool,
    dailyFees,
    dailyUserFees: dailyFees, // Same as dailyFees for Raydium swaps
    dailyRevenue, // ProtocolRevenue + HoldersRevenue
    dailyProtocolRevenue, // Treasury
    dailyHoldersRevenue, // Buybacks
    dailySupplySideRevenue, // LPs
  };
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2022-08-15',
  runAtCurrTime: true,
  methodology: {
    Fees: "Total trading fees collected from users across all pool types.",
    Revenue: "Protocol's total revenue, derived from Treasury allocations and RAY buybacks.",
    UserFees: "Total fees paid by users. Varies by pool: 0.25% for AMM, variable tiers for CLMM/CPMM.",
    SupplySideRevenue: "Fees allocated to liquidity providers (88% for AMM, 84% for CLMM/CPMM).",
    HoldersRevenue: "Fees allocated to RAY token buybacks (12% across all pool types).",
    ProtocolRevenue: "Fees allocated to the Raydium Treasury (4% from CLMM/CPMM pools, 0% from AMM).",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.SWAP_FEES]: "Total swap fees paid by traders across AMM, CLMM and CPMM pools.",
    },
    UserFees: {
      [METRIC.SWAP_FEES]: "Total swap fees paid by traders across AMM, CLMM and CPMM pools.",
    },
    Revenue: {
      [METRIC.PROTOCOL_FEES]: "4% of CLMM/CPMM swap fees allocated to the Raydium Treasury.",
      [METRIC.TOKEN_BUY_BACK]: "12% of swap fees across all pool types used to buy back RAY.",
    },
    ProtocolRevenue: {
      [METRIC.PROTOCOL_FEES]: "4% of CLMM/CPMM swap fees allocated to the Raydium Treasury.",
    },
    HoldersRevenue: {
      [METRIC.TOKEN_BUY_BACK]: "12% of swap fees across all pool types used to buy back RAY.",
    },
    SupplySideRevenue: {
      [METRIC.LP_FEES]: "Swap fees paid to liquidity providers (88% for AMM, 84% for CLMM/CPMM).",
    },
  },
};

export default adapter;

/*
    backfill steps

    1. https://api.raydium.io/pairs
    call all pairs

    2. for each pair use amm_id

    3. query rayqlbeta2.aleph.cloud for each pair and sum for respective dates

    {
    pool_hourly_data(address: "GaqgfieVmnmY4ZsZHHA6L5RSVzCGL3sKx4UgHBaYNy8m", skip: 10) {
        volume_usd
        time
    }
    }
*/
