import { FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const xaut = '0x68749665FF8D2d112Fa859AA293F07A622782F38'

const MINT_EVENT = 'event Mint (address indexed _destination, uint256 _amount)'
const REDEEM_EVENT = 'event Redeem (uint256 _amount)'

const fetch = async (_t: number, _c: any, options: FetchOptions) => {
    const dailyFees = options.createBalances();
    const [mintLogs, redeemLogs] = await Promise.all([
        options.getLogs({
            eventAbi: MINT_EVENT,
            target: xaut,
        }),
        options.getLogs({
            eventAbi: REDEEM_EVENT,
            target: xaut
        })
    ])
    mintLogs.concat(redeemLogs).forEach((log) => {
        const fee = Number(log._amount) * 0.0025;
        dailyFees.add(xaut, fee);
    });
    return {
        dailyFees,
        dailyRevenue: dailyFees,
        dailyUserFees: dailyFees,
    }
}
const adapters = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch,
      start: '2021-10-31',
    }
  },
  methodology: {
    Fees: "0.25% fee on purchase or redemption of XAUT tokens",
    Revenue: "Purchase and Redeem fees from users",
    UserFees: "Purchase and Redeem fees",
  }
};
export default adapters;