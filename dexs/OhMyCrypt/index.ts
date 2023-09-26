import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import type { ChainEndpoints, SimpleAdapter } from "../../adapters/types";
import type { Chain } from "@defillama/sdk/build/general";
import { request, gql } from "graphql-request";
import { getTimestampAtStartOfDayUTC } from '../../utils/date';

// Subgraphs endpoints
const endpoints: ChainEndpoints = {
  [CHAIN.BASE]: "https://api.thegraph.com/subgraphs/name/ohmycrypt/omcoff",
};

function formatEthers(weiAmount:string, decimals = 18) {
    const etherValue = parseFloat(weiAmount) / 10 ** decimals;
    return etherValue.toString() + ' Ether';
}

// Fetch function to query the subgraphs
const graphs = (graphUrls: ChainEndpoints) => {
    return (chain: Chain) => {
      return async (timestamp: number) => {
        const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp);
        const graphQueryusdcday = gql`
          query {
            activeOrders(where: {timestamp_gte: ${todaysTimestamp}, t2:"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" }) {
              t2a
            }
          }
          `;
          const graphQueryusdcalltime = gql`
          query {
            activeOrders(where: {t2:"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"}) {
              t2a
            }
          }
          `;
           const graphQuerydaiday = gql`
           query {
             activeOrders(where: {timestamp_gte: ${todaysTimestamp}, t2:"0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb" }) {
               t2a
             }
           }
           `;
           const graphQuerydaialltime = gql`
           query {
             activeOrders(where: {t2:"0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb"}) {
               t2a
             }
           }
           `;
          
          

const graphResusdcday = await request(graphUrls[chain], graphQueryusdcday);
const graphResusdcalltime = await request(graphUrls[chain], graphQueryusdcalltime);
const t2asday = graphResusdcday?.activeOrders.map((trade: { t2a: any})=> parseInt(formatEthers(trade.t2a))||0);
const t2asat= graphResusdcalltime?.activeOrders.map((trade: { t2a: any})=> parseInt(formatEthers(trade.t2a))||0);
const tvs = t2asat.reduce((total: any,amount: any) => total + amount, 0);
const dvs = t2asday.reduce((total: any,amount: any) => total + amount, 0);
const graphResdaiday = await request(graphUrls[chain], graphQuerydaiday);
const graphResdaialltime = await request(graphUrls[chain], graphQuerydaialltime);
const t2aeday = graphResdaiday?.activeOrders.map((trade: { t2a: any})=> parseInt(formatEthers(trade.t2a))||0);
const t2aeat= graphResdaialltime?.activeOrders.map((trade: { t2a: any})=> parseInt(formatEthers(trade.t2a))||0);
const tve = t2aeat.reduce((total: any,amount: any) => total + amount, 0);
const dve = t2aeday.reduce((total: any,amount: any) => total + amount, 0);

const totalVolume = tvs + tve;
const dailyVolume = dvs + dve;


return {
  timestamp,
  totalVolume: totalVolume.toString(),
  dailyVolume: dailyVolume.toString(),
};
};
};
};


const methodology = {
  Fees: "User pays 0.25% fees on each order.",
  ProtocolRevenue: "Treasury receives 0.125% of each order.",
  Revenue: "All revenue generated comes from user fees and shared to future token holders.",
};

const adapter: Adapter = {
    adapter: {
      [CHAIN.BASE]: {
        fetch: graphs(endpoints)(CHAIN.BASE),
        start: async () => 	1695623993,
      },
    },
  };
  
  export default adapter;
