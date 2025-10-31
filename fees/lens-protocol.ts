import { FetchOptions, FetchV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const fetch: FetchV2 = async (option: FetchOptions) => {
  const dailyFees = option.createBalances()
  const dailyBribesRevenue = option.createBalances()
  const logs = await option.getLogs({
    target: "0xe7e7ead361f3aacd73a61a9bd6c10ca17f38e945",
    eventAbi: "event HandleMinted(string handle,string namespace,uint256 handleId,address to,uint256 timestamp)",
  })
  logs.map(() => {
    dailyFees.addGasToken(8 * 1e18);
    dailyBribesRevenue.addGasToken(8 * 1e18);
  })

  return {
    dailyFees,
    dailyRevenue: dailyBribesRevenue
  }
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.POLYGON]: {
      fetch: fetch,
      start: '2024-02-25',
    },
  },
  version: 2,
  methodology: {
    Fees: 'Fees paid by users for creating profiles.',
    Revenue: 'Fees paid by users for creating profiles.',
  }
}

export default adapter;
