import type { FetchOptions, } from "../../adapters/types";
import { Adapter, ProtocolType } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dayTimestamp = options.startOfDay * 1000;

  const data = await httpGet('https://api.viewblock.io/arweave/stats/advanced/charts/txFees?network=mainnet', {
    headers: {
      'origin': 'https://arscan.io'
    }
  });

  const timestamps = data.day.data[0];
  const fees = data.day.data[1];

  const index = timestamps.findIndex((ts: number) => ts === dayTimestamp)
  if (index === -1) {
    throw new Error(`No data found for date: ${new Date(dayTimestamp).toISOString()}`);
  }
  const tokenAmount = parseFloat(fees[index]);

  const dailyFees = options.createBalances();
  dailyFees.addCGToken('arweave', tokenAmount)

  return {
    dailyFees
  }
}

const adapter: Adapter = {
  version: 1,
  adapter: {
    [CHAIN.ARWEAVE]: {
      fetch,
      start: '2018-06-08',
    },
  },
  protocolType: ProtocolType.CHAIN,
  methodology: {
    Fees: 'Fees are collected in AR (Arweave) tokens for each transaction on the Arweave network. The data is fetched from ViewBlock API which aggregates transaction fees from the Arweave blockchain. The fees represent the total amount paid by users for data storage and transfer on the network.'
  }
}

export default adapter;

