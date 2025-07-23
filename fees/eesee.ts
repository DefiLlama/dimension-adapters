import { Adapter, FetchV2, } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const abi_event = {
  TokenPaymasterOperation: "event TokenPaymasterOperation (address indexed sender, address indexed token, uint256 indexed totalCharge, address oracleAggregator, uint32 priceMarkup, bytes32 userOpHash, uint256 exchangeRate, uint8 priceSource)",
};

const paymaster = '0x00000f7365ca6c59a2c93719ad53d567ed49c14c';

const adapter: Adapter = {
  adapter: {
    [CHAIN.BLAST]: {
      fetch: (async (options) => {
        const dailyFees = options.createBalances();
        const logs = await options.getLogs({ target: paymaster, eventAbi: abi_event.TokenPaymasterOperation, })
        logs.map((tx: any) => {
          dailyFees.add(tx.token, tx.totalCharge)
        })
        return { dailyFees, }
      }) as FetchV2,
            meta: {
        methodology: {}
      }
    },
  },
  version: 2,
}

export default adapter;