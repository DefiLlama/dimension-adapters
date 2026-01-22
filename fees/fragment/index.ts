import { FetchOptions, SimpleAdapter, FetchResult, Dependencies } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

async function fetch(_a: any, _b: any, options: FetchOptions): Promise<FetchResult> {
  
    const query = `
      with received as (
        select
          sum(value / 1e9) as ton_received
          from ton.messages
          where direction = 'in'
        and destination in (
          UPPER('0:852443f8599fe6a5da34fe43049ac4e0beb3071bb2bfb56635ea9421287c283a'), --stars
          UPPER('0:5e69bec3dfc448c32a5e81b37b619810cf00db6fc41f30cc18f28b89737a8f97'), --ads
          UPPER('0:408da3b28b6c065a593e10391269baaa9c5f8caebc0c69d9f0aabbab2a99256b') --marketplace
      ) 
        and block_time>=from_unixtime(${options.fromTimestamp}) and block_time<from_unixtime(${options.toTimestamp})),
      sent as (
        select
          sum(value / 1e9) as ton_sent
          from ton.messages
          where direction = 'out'
        and source in (
          UPPER('0:e6f3d8824f46b1efbab9afc684793428c55fed69b46a15a49be69a29bc49e530'), --star rewards
          UPPER('0:43512860d54980cf24d59868a30e679927fb1373c10964db7500edcdf690abc4') --ad rewards
      ) 
        and block_time>=from_unixtime(${options.fromTimestamp}) and block_time<from_unixtime(${options.toTimestamp}))

      select  
        coalesce(ton_received, 0) as ton_received,
        coalesce(ton_sent, 0) as ton_sent
      from sent full outer join received on 1=1;`;

    const queryResults = await queryDuneSql(options, query);
    
    if (!queryResults[0] || !queryResults[0].ton_received ||!queryResults[0].ton_sent) {
      throw new Error('query Dune return null result');
    }
    if(queryResults[0].ton_sent>queryResults[0].ton_received)
      throw new Error("Rewards exceed payments, possibly due to more onchain redeems of offchain purchased stars");
    
    const dailyFees = options.createBalances();
    dailyFees.addCGToken("the-open-network", queryResults[0].ton_received);

    const dailySupplySideRevenue = options.createBalances();
    dailySupplySideRevenue.addCGToken("the-open-network", queryResults[0].ton_sent);

    const dailyRevenue = dailyFees.clone();
    dailyRevenue.subtract(dailySupplySideRevenue);

    return {
        dailyFees,
        dailyRevenue,
        dailyProtocolRevenue: dailyRevenue,
        dailySupplySideRevenue,
    }
}

const methodology = {
    Fees: "Includes NFT marketplace fees(auction fees of usernames and numbers, telegram premium), fees to buy telegram ads ,stars etc ",
    Revenue: "All fees excluding ad and star rewards",
    ProtocolRevenue: "All the revenue goes to protocol",
    SupplySideRevenue: "Ad rewards and star rewards shared among channel and bot owners"
};

const adapter: SimpleAdapter = {
    fetch,
    chains: [CHAIN.TON],
    start: '2024-10-01',
    methodology,
    isExpensiveAdapter: true,
    dependencies: [Dependencies.DUNE]
}

export default adapter;