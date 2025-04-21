import { FetchResultFees, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import fetchURL, { postURL } from "../../utils/fetchURL"

const graphs = async (timestamp: number): Promise<FetchResultVolume & FetchResultFees> => {
  const ammPoolStandard: any[] = [];
  let page = 1;
  while (true) {
    const response = await fetchURL(`https://api-v3.raydium.io/pools/info/list?poolType=all&poolSortField=volume24h&sortType=desc&pageSize=1000&page=${page}`);
    const data = response.data.data;
    if (!data || data.length === 0) break;
    ammPoolStandard.push(...data);
    page++;
  }
  const validPools = ammPoolStandard.filter((i: any) => ((Number(i.tvl) >  10_000) || (Number(i.feeRate) > 0.001)));
  console.log(`total pages: ${page} and valid pools: ${validPools.length} and all pools: ${ammPoolStandard.length}`);

  const dailyVolumeAmmPool = validPools
    .reduce((a: number, b) => a + b.day.volume, 0)

  let ammFee = 0
  let clmmFee = 0
  let cpmmFee = 0
  for (const item of validPools){
    if (item.programId === 'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK') clmmFee += item.day.volumeFee
    else if (item.programId === 'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C') cpmmFee += item.day.volumeFee
    else ammFee += item.day.volumeFee
  }

  const dailyVolumeAmmPoolFee = ammFee + clmmFee + cpmmFee

  const dailyRevenueFund = ammFee * 0.03 + clmmFee * 0.04 + cpmmFee * 0.04
  const dailyRevenueProtocol = ammFee * 0.0 + clmmFee * 0.12 + cpmmFee * 0.12

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
    totalFees: dailyVolumeAmmPoolFee,
    dailyFees: dailyVolumeAmmPoolFee,
    dailyUserFees: dailyVolumeAmmPoolFee,
    totalRevenue: `${dailyRevenueFund + dailyRevenueProtocol}`,
    dailyRevenue: `${dailyRevenueFund + dailyRevenueProtocol}`,
    dailyProtocolRevenue: `${dailyRevenueFund + dailyRevenueProtocol}`,
    // dailyHoldersRevenue: `${buyRayAll * rayPrice}`, // seem it total value not daily
    dailySupplySideRevenue: `${dailyVolumeAmmPoolFee - dailyRevenueFund - dailyRevenueProtocol}`,
    totalProtocolRevenue: `${dailyRevenueFund + dailyRevenueProtocol}`,
    totalSupplySideRevenue: `${dailyVolumeAmmPoolFee - dailyRevenueFund - dailyRevenueProtocol}`,
    totalUserFees: dailyVolumeAmmPoolFee,
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
