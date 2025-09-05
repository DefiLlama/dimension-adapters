import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const config = {
  HYPE: "0x0d01dc56dcaaca66ad901c959b4011ec",
  MEMELaunchpad: "0x9246d27EA8059529a615a4ACF35351dF0fa6168e",
  LaunchpadStorage: "0xbeB68E2EA9676a0744ca0552f78b87F40A5e9619",
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyVolume = options.createBalances();
  const dailyRevenue = options.createBalances();

  const totalFee = await options.api.call({
    target: config.LaunchpadStorage,
    abi: "uint256:totalTradingFee",
  });
  
  const buyLogs = await options.getLogs({
    target: config.MEMELaunchpad,
    eventAbi: "event MemeTokenBuy(address indexed memeToken, address indexed user, uint256 depositTokenAmount, uint256 memeTokenAmountRec)",
  })

  const sellLogs = await options.getLogs({
    target: config.MEMELaunchpad,
    eventAbi: "event MemeTokenSell(address indexed memeToken, address indexed user, uint256 memeTokenAmount, uint256 depositTokenAmountRec)",
  })

  buyLogs.forEach((log) => {
    const amount = log.depositTokenAmount * BigInt(10 ** 8) / BigInt(10 ** 18);
    dailyVolume.add(config.HYPE, amount);
  });

  sellLogs.forEach((log) => {
    const amount = log.depositTokenAmountRec * BigInt(10 ** 8) / BigInt(10 ** 18);
    dailyVolume.add(config.HYPE, amount);
  });
  
  dailyFees.add(dailyVolume.clone(totalFee / 10000));

  dailyRevenue.add(dailyFees.clone(0.8));

  return { dailyVolume, dailyFees, dailyRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.HYPERLIQUID]: {
      fetch,
      start: '2025-08-21',
    },
  },
  methodology: {
    Volume: "Tokens trading volume.",
    Fees: "Tokens trading fees paid by users.",
    Revenue: "Tokens trading fees goes to the protocol.",
  }
};

export default adapter;