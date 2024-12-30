import { Adapter, FetchOptions, } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from '../helpers/coreAssets.json';
import { queryDune } from "../helpers/dune";
import moment from "moment";


const fetch: any = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  let feeTo = "0x521faacdfa097ad35a32387727e468f7fd032fd6";
  
  // add native fee
  await options.api.sumTokens({ owner: feeTo, token: ADDRESSES.null });
  await options.fromApi.sumTokens({ owner: feeTo, token: ADDRESSES.null });
  dailyFees.addBalances(options.api.getBalancesV2());
  dailyFees.subtract(options.fromApi.getBalancesV2());

  let startDate = new Date();
  startDate.setTime(options.startTimestamp * 1000);
  let start = moment(startDate).format("YYYY-MM-DD hh:mm:ss");
  let endDate = new Date();
  endDate.setTime(options.endTimestamp * 1000);
  let end = moment(endDate).format("YYYY-MM-DD hh:mm:ss");

  const values = await queryDune('4444430', {
    chain: options.chain == 'bsc' ? 'bnb' : options.chain,
    start,
    end,
    to: feeTo
  })

  values.forEach((e: { contract_address: string; amount_raw: string; }) => {
    dailyFees.add(e.contract_address, e.amount_raw);
  });

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees, }
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: { fetch, start: '2024-09-20', },
    [CHAIN.BSC]: { fetch, start: '2024-09-19', },
    [CHAIN.BASE]: { fetch, start: '2024-09-20', },
    [CHAIN.ARBITRUM]: { fetch, start: '2024-11-28', },
    // [CHAIN.GRAVITY]: { fetch, start: '2024-12-11', },
    // [CHAIN.MORPH]: { fetch, start: '2024-12-11', },
  },

}

export default adapter;
