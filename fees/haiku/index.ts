import ADDRESSES from '../../helpers/coreAssets.json'
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { HaikuChainConfig } from "../../helpers/aggregators/haiku";

const HaikuExecutedEvent =
  "event Executed(address indexed user, address indexed agent)";

const HaikuFeeCollectedEvent =
  "event Charged(address indexed token, uint256 amount, address indexed collector, bytes32 metadata)";

const nativeToken = ADDRESSES.GAS_TOKEN_2;

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const data: any[] = await options.getLogs({
    target: HaikuChainConfig[options.chain].id,
    eventAbi: HaikuExecutedEvent,
  });

  const uniqueAgents = [...new Set(data.map((log: any) => log[1]))];

  await Promise.all(
    uniqueAgents.map(async (address: any) => {
      const fee = await options.getLogs({
        target: address,
        eventAbi: HaikuFeeCollectedEvent,
      });
      fee.forEach((feePerTx: any) => {
        if (feePerTx[0].toLowerCase() !== nativeToken.toLowerCase()) {
          dailyFees.add(feePerTx[0], feePerTx[1]);
        } else {
          dailyFees.addGasToken(feePerTx[1]);
        }
      });
    })
  );
  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    Fees: "All fees paid by users for swap and bridge tokens via Haiku.",
    Revenue: "Fees are distributed to Haiku.",
    ProtocolRevenue: "Fees are distributed to Haiku.",
  },
  fetch,
  adapter: HaikuChainConfig
};

export default adapter;
