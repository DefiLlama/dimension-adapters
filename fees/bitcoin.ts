import { Adapter, FetchOptions, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// const feeAdapter = chainAdapter(CHAIN.BITCOIN, "btc", 1230958800);

async function fetchFunction(_a: any, _b: any, options: FetchOptions) {
  const response = await fetch("https://api.blockchain.info/charts/transaction-fees?timespan=1year&format=json", {
    "headers": {
      "accept": "application/json, text/plain, */*"
    },
    "body": null,
    "method": "GET"
  });
  
  const { values } = await response.json();

  const item = values.find((i: any) => Number(i.x) === options.startOfDay);
  if (!item) {
    throw Error(`can not get Bitcoin fees for date ${options.startOfDay}`);
  }
  
  const dailyFees = options.createBalances()
  dailyFees.addCGToken('bitcoin', item.y)

  return {
    dailyFees,
  }
}

const adapter: Adapter = {
  version: 1,
  fetch: fetchFunction,
  chains: [CHAIN.BITCOIN],
  protocolType: ProtocolType.CHAIN
}

export default adapter;
