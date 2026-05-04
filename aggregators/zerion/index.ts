import { FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// https://github.com/zeriontech/defi-sdk/blob/router/contracts/router/Router.sol
// https://optimistic.etherscan.io/address/0xd7F1Dd5D49206349CaE8b585fcB0Ce3D96f1696F
const ROUTER = "0xd7F1Dd5D49206349CaE8b585fcB0Ce3D96f1696F";

// https://github.com/zeriontech/defi-sdk/blob/router/contracts/interfaces/IRouter.sol
const eventAbi = "event Executed(address indexed inputToken, uint256 absoluteInputAmount, uint256 inputBalanceChange, address indexed outputToken, uint256 absoluteOutputAmount, uint256 returnedAmount, uint256 protocolFeeAmount, uint256 marketplaceFeeAmount, tuple(uint8 swapType, tuple(uint256 share, address beneficiary) protocolFee, tuple(uint256 share, address beneficiary) marketplaceFee, address account, address caller, bytes callerCallData) swapDescription, address sender)";

const fetch = async ({ createBalances, getLogs }: FetchOptions) => {
  const dailyVolume = createBalances();

  const logs = await getLogs({ target: ROUTER, eventAbi });
  logs.forEach((log: any) => {
    dailyVolume.add(log.inputToken, log.absoluteInputAmount);
  });

  return { dailyVolume };
};

const adapter: any = {
  version: 2,
  adapter: {
    [CHAIN.OPTIMISM]: { fetch, start: "2022-04-01" },
    [CHAIN.ARBITRUM]: { fetch, start: "2022-04-01" },
    [CHAIN.BASE]: { fetch, start: "2023-08-01" },
    [CHAIN.POLYGON]: { fetch, start: "2022-04-01" },
    [CHAIN.BSC]: { fetch, start: "2022-04-01" },
    [CHAIN.AVAX]: { fetch, start: "2022-04-01" },
  },
};

export default adapter;
