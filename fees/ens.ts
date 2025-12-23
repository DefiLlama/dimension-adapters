import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const abi_event = {
  nameRegistered:
    "event NameRegistered(string name,bytes32 indexed label,address indexed owner,uint256 baseCost,uint256 premium,uint256 expires)",
  nameRenewed:
    "event NameRenewed(string name,bytes32 indexed label,uint256 cost,uint256 expires)",
};

const address_v4 = "0x283af0b28c62c092c9727f1ee09c02ca627eb7f5";
const address_v5 = "0x253553366da8546fc250f225fe3d25d0c782303b";

const methodology = {
  Fees: "Registration and renewal costs",
  Revenue: "Registration and renewal costs",
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: async (options: FetchOptions) => {
        const dailyFees = options.createBalances();

        const registeredLogs = await options.getLogs({
          targets: [address_v4, address_v5],
          eventAbi: abi_event.nameRegistered,
        });

        const renewedLogs = await options.getLogs({
          targets: [address_v4, address_v5],
          eventAbi: abi_event.nameRenewed,
        });

        renewedLogs.map((tx: any) => {
          if (Number(tx.cost) / 1e18 < 10) {
            dailyFees.addGasToken(tx.cost);
          }
        });

        registeredLogs.map((tx: any) => {
          const total = Number(tx.baseCost) + Number(tx.premium);
          if (total / 1e18 < 10) {
            dailyFees.addGasToken(total);
          }
        });

        return {
          dailyFees,
          dailyRevenue: dailyFees,
        };
      },
      start: 1677110400, // 2023-02-23
    },
  },
  methodology,
};

export default adapter;
