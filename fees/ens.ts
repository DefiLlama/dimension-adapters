import { Adapter, FetchOptions, } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const abi_event = {
  nameRegistered: "event NameRegistered(string name,bytes32 indexed label,address indexed owner,uint256 cost,uint256 expires)",
  nameRenewed: "event NameRenewed(string name,bytes32 indexed label,uint256 cost,uint256 expires)",
};

const address_v4 = '0x283af0b28c62c092c9727f1ee09c02ca627eb7f5';
const address_v5 = '0x253553366da8546fc250f225fe3d25d0c782303b';

const methodology = {
  Fees: "registration and renew cost",
  Revenue: "registration and renew cost",
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: (async (timestamp: number, _: any, options: FetchOptions) => {
        const dailyFees = options.createBalances();
        const registeredLogs = await options.getLogs({
          targets: [address_v4, address_v5],
          eventAbi: abi_event.nameRegistered,
        })
        const renewedLogs = await options.getLogs({
          targets: [address_v4, address_v5],
          eventAbi: abi_event.nameRenewed,
        })
        registeredLogs.concat(renewedLogs).map((tx: any) => {
          dailyFees.addGasToken(tx.cost)
        })
        return { timestamp, dailyFees, dailyRevenue: dailyFees, }
      }) as any,
      start: 1677110400,
      meta: {
        methodology
      }
    },
  },

}

export default adapter;
