import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADRESSES from "../helpers/coreAssets.json";

const config = {
  MEMELaunchpad: "0x9246d27EA8059529a615a4ACF35351dF0fa6168e",
  LaunchpadStorage: "0xbeB68E2EA9676a0744ca0552f78b87F40A5e9619",
};

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

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
    dailyVolume.add(ADRESSES.hyperliquid.WHYPE, log.depositTokenAmount);
  });

  sellLogs.forEach((log) => {
    dailyVolume.add(ADRESSES.hyperliquid.WHYPE, log.depositTokenAmountRec);
  });

  const dailyFees = dailyVolume.clone(totalFee / 10000)
  const dailyRevenue = dailyFees.clone(0.8);
  const dailySupplySideRevenue = dailyFees.clone(0.2);

  return { dailyVolume, dailyFees, dailySupplySideRevenue, dailyProtocolRevenue: dailyRevenue, dailyUserFees: dailyFees, dailyHoldersRevenue: 0, dailyRevenue, }
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  start: '2025-08-21',
  adapter: {
    [CHAIN.HYPERLIQUID]: {
    },
  },
  methodology: {
    SupplySideRevenue: "20% of trading fees go to the coin creators",
    Volume: "Tokens trading volume.",
    Fees: "1% trading fees on all trades.",
    Revenue: "80% of Tokens trading fees goes to the protocol.",
  }
};

export default adapter;