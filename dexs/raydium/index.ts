import { FetchResultFees, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import fetchURL, { postURL } from "../../utils/fetchURL"
import * as sdk from "@defillama/sdk"
import PromisePool from "@supercharge/promise-pool";


const graphs = async (timestamp: number): Promise<FetchResultVolume & FetchResultFees> => {
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

  const dailyFees = ammFee + clmmFee + cpmmFee; // Total fees paid by users
  const dailyUserFees = dailyFees; // Same as dailyFees for Raydium swaps

  // Protocol Revenue (Treasury)
  // AMM: 0%, CLMM: 4%, CPMM: 4%
  const dailyProtocolRevenue = (clmmFee + cpmmFee) * 0.04;

  // Holders Revenue (Buybacks)
  // AMM: 12%, CLMM: 12%, CPMM: 12%
  const dailyHoldersRevenue = (ammFee + clmmFee + cpmmFee) * 0.12;

  // Total Revenue (Protocol + Holders)
  const dailyRevenue = dailyProtocolRevenue + dailyHoldersRevenue;

  // Supply Side Revenue (LPs)
  // Can be calculated as Total Fees - Total Revenue
  const dailySupplySideRevenue = dailyFees - dailyRevenue;

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
    timestamp: timestamp,
    dailyFees: `${dailyFees}`,
    dailyUserFees: `${dailyUserFees}`,
    dailyRevenue: `${dailyRevenue}`,          // ProtocolRevenue + HoldersRevenue
    dailyProtocolRevenue: `${dailyProtocolRevenue}`, // Treasury
    dailyHoldersRevenue: `${dailyHoldersRevenue}`,   // Buybacks
    dailySupplySideRevenue: `${dailySupplySideRevenue}`, // LPs
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    solana: {
      fetch: graphs,
      runAtCurrTime: true,
      start: '2022-08-15',
    },
  },
  methodology: {
    Fees: "Total trading fees collected from users across all pool types.",
    Revenue: "Protocol's total revenue, derived from Treasury allocations and RAY buybacks.",
    UserFees: "Total fees paid by users. Varies by pool: 0.25% for AMM, variable tiers for CLMM/CPMM.",
    SupplySideRevenue: "Fees allocated to liquidity providers (88% for AMM, 84% for CLMM/CPMM).",
    HoldersRevenue: "Fees allocated to RAY token buybacks (12% across all pool types).",
    ProtocolRevenue: "Fees allocated to the Raydium Treasury (4% from CLMM/CPMM pools, 0% from AMM).",
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
