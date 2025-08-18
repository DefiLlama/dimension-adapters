import { Adapter, FetchOptions, } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const abi_event = {
  nameRegistered: "event Register(address indexed owner,uint256 indexed rootId,uint256 indexed tokenId,uint256 fee,bytes fullName)",
};

const methodology = {
  Fees: "registration and renew cost",
  Revenue: "registration and renew cost",
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.BITLAYER]: {
      fetch: (async (options: FetchOptions) => {
        const dailyFees = options.createBalances();
        const registeredLogs = await options.getLogs({
          targets: ['0x048d86f26952aB5e1F601f897BC9512A1E7fA675'],
          eventAbi: abi_event.nameRegistered,
        })
        registeredLogs.map((tx: any) => {
          dailyFees.addGasToken(tx.fee)
        })
        return { dailyFees, dailyRevenue: dailyFees, }
      }) as any,
      start: '2023-02-23',
    },
  },
  methodology

}

export default adapter;
