import { FetchOptions, SimpleAdapter, FetchResult, Dependencies } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

async function fetch(_a: any, _b: any, options: FetchOptions): Promise<FetchResult> {
  
    const query = `select
      sum(value / 1e9) as ton_received
    from ton.messages
    where direction = 'in'
      and destination in (
          UPPER('0:852443f8599fe6a5da34fe43049ac4e0beb3071bb2bfb56635ea9421287c283a'), --stars
          UPPER('0:5e69bec3dfc448c32a5e81b37b619810cf00db6fc41f30cc18f28b89737a8f97'), --ads
          UPPER('0:408da3b28b6c065a593e10391269baaa9c5f8caebc0c69d9f0aabbab2a99256b')  --marketplace
      ) 
      and block_time>=from_unixtime(${options.fromTimestamp}) and block_time<from_unixtime(${options.toTimestamp})`;

    const queryResults = await queryDuneSql(options, query);
    
    if (!queryResults[0] || !queryResults[0].ton_received) {
      throw Error('query Dune return null result');
    }
    
    const dailyFees = options.createBalances();
    dailyFees.addCGToken("the-open-network", queryResults[0].ton_received);

    return {
        dailyFees,
        dailyRevenue: dailyFees,
        dailyProtocolRevenue: dailyFees
    }
}

const methodology = {
    Fees: "Includes NFT marketplace fees(auction fees of usernames and numbers, telegram premium), fees to buy telegram ads ,stars etc ",
    Revenue: "All fees are revenue",
    ProtocolRevenue: "All the fees goes to protocol"
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