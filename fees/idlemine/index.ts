import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";


interface Transaction {
  value: string;
}

function getIncomingTransactions(address: string, apiKey: string): Promise<Transaction[]> {
  const url = "https://api.bscscan.com/api";
  const params = new URLSearchParams({
    module: "account",
    action: "tokentx",
    address: address,
    startblock: "0",
    endblock: "99999999",
    sort: "asc",
    apikey: apiKey
  }).toString();

  return fetchURL(`${url}?${params}`)
    .then(response => response)
    .then(data => data.result as Transaction[])
    .catch(error => {
      console.error('Error fetching transactions:', error);
      throw error;
    });
}

const fetch = (timestampSeconds: number, _: any, options: FetchOptions): Promise<{ timestamp: number, totalRevenue?: number }> => {
  const apiKey = "Q8K3QBMMFXMSJ48EKFUVA7X46TJHBSD1P8";
  const address = "0x3aa2609e1aa9A83034F59994D95E495a8904BA83";

  return getIncomingTransactions(address, apiKey)
    .then(transactions => {
      let totalRevenue = 0n;  // Using BigInt for accurate large number arithmetic
      transactions.forEach(transaction => {
        const valueInTokens = BigInt(transaction.value) / BigInt(1e18);
        if(valueInTokens<=6000){
          totalRevenue += valueInTokens;
        }
      
        
      });
      return {
        timestamp: timestampSeconds,
        totalRevenue: Number(totalRevenue)  // Convert BigInt to a number, beware of potential overflow with large totals
      };
    })
    .catch(error => {
      console.error('Error in fetching transactions:', error);
      return {
        timestamp: timestampSeconds,
        
      };
    });
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.BSC]: {
      fetch,
      start: 1709251200, // Start timestamp in seconds, adjusted as per your project timeline.
      meta: {
        methodology: "Calculates revenue from specific blockchain games using transaction data."
      },
    },
  },
};

export default adapter;
