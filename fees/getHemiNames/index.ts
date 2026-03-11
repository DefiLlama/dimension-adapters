import { Adapter, FetchOptions, } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const abi_event = {
  nameRegistered: "event NameRegistered(string name,bytes32 indexed label,address indexed owner,uint256 baseCost,uint256 premium,uint256 expires)",
  nameRenewed: "event NameRenewed(string name,bytes32 indexed label,uint256 cost,uint256 expires)",
};

const address_v1 = '0x1BB80e6A646a3C4Eb7b16c867748b75201482aF3';

const methodology = {
  Fees: "registration and renew cost",
  Revenue: "registration and renew cost",
}

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.HEMI]: {
      fetch: (async (options: FetchOptions) => {
        const dailyFees = options.createBalances();
        const registeredLogs = await options.getLogs({
          targets: [address_v1],
          eventAbi: abi_event.nameRegistered,
        })
        const renewedLogs = await options.getLogs({
          targets: [address_v1],
          eventAbi: abi_event.nameRenewed,
        })
        renewedLogs.map((tx: any) => {
          if (Number(tx.const) / 1e18 < 10) {
            dailyFees.addGasToken(tx.cost)
          }
        })
        registeredLogs.map((tx: any) => {
          if (Number(tx.baseCost) / 1e18 < 10) {
            dailyFees.addGasToken(tx.baseCost)
          }
        })
        return { dailyFees, dailyRevenue: dailyFees, }
      }) as any,
      start: '2025-03-17',
    },
  },
  methodology,

}

export default adapter;