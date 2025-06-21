import { Interface } from "ethers";
import { Adapter, FetchOptions, } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import *  as sdk from '@defillama/sdk'

const EnsAbis = {
  // controller
  nameRegisteredV4: "event NameRegistered(string name, bytes32 indexed label, address indexed owner, uint cost, uint expires)",
  nameRegisteredV5: "event NameRegistered(string name,bytes32 indexed label,address indexed owner,uint256 cost,uint256 premium,uint256 expires)",
  nameRenewed: "event NameRenewed(string name,bytes32 indexed label,uint256 cost,uint256 expires)",

  // implementation
  nameExpires: "function nameExpires(uint256) view returns (uint256)",

  // chainlink eth_usd
  latestAnswer: 'int256:latestAnswer',
};

const address_v4_controller = '0x283af0b28c62c092c9727f1ee09c02ca627eb7f5';
const address_v5_controller = '0x253553366da8546fc250f225fe3d25d0c782303b';
const address_v2_implementation = '0x57f1887a8bf19b14fc0df6fd9b2acc9af147ea85';
const address_chainlink_ethusd = '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419';

const methodology = {
  Fees: "registration and renew cost",
  Revenue: "registration and renew cost",
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: async (options: FetchOptions) => {
        const dailyFees = options.createBalances();

        const registeredV4Logs = await options.getLogs({
          targets: [address_v4_controller],
          eventAbi: EnsAbis.nameRegisteredV4,
        })
        const registeredV5Logs = await options.getLogs({
          targets: [address_v5_controller],
          eventAbi: EnsAbis.nameRegisteredV5,
        })
        const renewedLogs = await options.getLogs({
          targets: [address_v4_controller, address_v5_controller],
          entireLog: true,
          eventAbi: EnsAbis.nameRenewed,
        })

        // get ETH price here to reduce rpc calls
        const latestAnswer = await options.api.call({
          chain: options.chain,
          target: address_chainlink_ethusd,
          abi: EnsAbis.latestAnswer,
          params: [],
        })

        // count renew cost
        const lendingPoolContract: Interface = new Interface([
          EnsAbis.nameRenewed,
        ])
        for (const log of renewedLogs) {
          const event: any = lendingPoolContract.parseLog(log)
          
          // address_v5_controller contract has a bug in emit NameRenewed event
          // it emits the entry msg.value of transaction as renew cost which is wrong in case sender sent more ETH than the cost
          // https://etherscan.io/address/0x253553366da8546fc250f225fe3d25d0c782303b#code#F1#L226
          // it should be: emit NameRenewed(name, labelhash, price.base, expires);
          if (String(log.address).toLowerCase() === address_v5_controller) {
            const nameExpires = await sdk.api2.abi.call({
              chain: options.chain,
              target: address_v2_implementation,
              abi: EnsAbis.nameExpires,
              params: [event.args[1]],
              block: log.blockNumber - 1
            })

            const nameExpiresBeforeRenew = Number(nameExpires)
            const nameExpiresAfterRenew = Number(event.args[3])
            const duration = nameExpiresAfterRenew - nameExpiresBeforeRenew
            if (nameExpiresAfterRenew > options.startTimestamp && duration > 0) {
              // get base price in USD
              let basePrice = 0

              // https://etherscan.io/address/0x7542565191d074cE84fBfA92cAE13AcB84788CA9#code#F6#L24
              const price3Letter = 20294266869609
              const price4Letter = 5073566717402
              const price5Letter = 158548959919
              const nameLen = String(event.args[0]).length
              if (nameLen >= 5) {
                basePrice = price5Letter * duration;
              } else if (nameLen == 4) {
                basePrice = price4Letter * duration;
              } else if (nameLen == 3) {
                basePrice = price3Letter * duration;
              }

              // convert to ETH
              const basePriceInETH = basePrice * 1e8 / Number(latestAnswer)

              dailyFees.addGasToken(basePriceInETH)
            }
          } else {
            dailyFees.addGasToken(event.args.cost)
          }
        }

        // count register cost
        registeredV4Logs.map((tx: any) => {
          dailyFees.addGasToken(tx.cost)
        })
        registeredV5Logs.map((tx: any) => {
          dailyFees.addGasToken(tx.cost)
          dailyFees.addGasToken(tx.premium)
        })
        return { dailyFees, dailyRevenue: dailyFees, }
      },
      start: '2023-02-23',
      meta: {
        methodology
      }
    },
  },

}

export default adapter;
