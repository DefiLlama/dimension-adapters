import { Adapter,Fetch } from "../../adapters/types";
import { request, gql } from "graphql-request";

import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";



const endpoints: { [key: string]: string } = {
    [CHAIN.ARBITRUM]: "https://api.blex.io/arbitrum_42161/subgraph",
}


const markets=[
 "0x7B173a3A8d562B7Fb99743a3707deF1236935ac5", //ETH market
 "0x1e9cbaaa0a7c1F72a8769EA0e3A03e7fB5458925", //BTC market
];

const allFeesData=gql`
    query get_fees($period: String!, $id: String!){
        fees(where: {period: $period, id: $id}){
            open
            close
            execution
            liquidation
            funding
            mint
            burn
        }
    }
`
const userFeesData=gql`
    query get_fees($period: String!, $id: String!){
        fees(where: {period: $period, id: $id}){
            open
            close
            execution
            liquidation
            funding
        }
    }
`

interface IGraphResponse{
    fees: Array<{
        open: string
        close: string
        execution: string
        liquidation: string
        funding: string
        mint: string
        burn: string
    }>
}



const getFetch = (allFeeQuery: string,userFeeQuery: string)=> (chain: string): Fetch => async (timestamp: number) => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(new Date((timestamp * 1000)))

    const searchTimestamp= "daily:"+String(dayTimestamp) ;


    const dailyAllFeeData: IGraphResponse = await request(endpoints[chain], allFeeQuery, {
        id: searchTimestamp,
        period: 'daily',
    })

    const dailyUserData: IGraphResponse = await request(endpoints[chain], userFeeQuery, {
        id: searchTimestamp,
        period: 'daily',
    })


    return {
      timestamp: dayTimestamp,
      dailyUserFees:
      dailyUserData.fees.length==1
        ? String(Number(Object.values(dailyUserData.fees[0]).reduce((sum, element) => String(Number(sum) + Math.abs(Number(element))))) * 10 ** -18)
          : undefined,
      dailyFees:
      dailyAllFeeData.fees.length==1
        ? String(Number(Object.values(dailyAllFeeData.fees[0]).reduce((sum, element) => String(Number(sum) + Math.abs(Number(element))))) * 10 ** -18)
          : undefined,
    }
  }

const adapter: Adapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: getFetch(allFeesData,userFeesData)(CHAIN.ARBITRUM),
      start: '2023-08-05',
    },
  },
  version: 1
}

export default adapter;
