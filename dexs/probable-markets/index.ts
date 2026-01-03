import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const CONTRACT_ADDRESS = "0xf99f5367ce708c66f0860b77b4331301a5597c86";
const USDT_ADDRESS = "0x55d398326f99059fF775485246999027B3197955"; 

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  const logs = await options.getLogs({
    target: CONTRACT_ADDRESS,
    eventAbi: 'event OrderFilled(bytes32 indexed orderHash, address indexed maker, address indexed taker, uint256 makerAssetId, uint256 takerAssetId, uint256 makerAmountFilled, uint256 takerAmountFilled, uint256 fee)',
  });

  logs.forEach((log: any) => {
    if (log.makerAssetId.toString() === '0') {
      const volumeInWei = BigInt(log.makerAmountFilled) / 2n;
      dailyVolume.add(USDT_ADDRESS, volumeInWei);
    }
    else if (log.takerAssetId.toString() === '0') {
      const volumeInWei = BigInt(log.takerAmountFilled) / 2n;
      dailyVolume.add(USDT_ADDRESS, volumeInWei);
    }
  });

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BSC]: {
      fetch,
      start: "2025-12-09",
    },
  },
};

export default adapter;