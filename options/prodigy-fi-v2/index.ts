import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const POSITION_OPENED = "event PositionOpened(address indexed token,uint256 premium,uint256 amount)";

type ChainConfig = {
  positionManager: string;
  start: string;
};

const config: Record<string, ChainConfig> = {
  [CHAIN.ETHEREUM]: {
    positionManager: "0x50aB3FE7d089c4F0dD8096aAeA9578f8E7B18AF7",
    start: "2026-09-06",
  },
  [CHAIN.BASE]: {
    positionManager: "0x50aB3FE7d089c4F0dD8096aAeA9578f8E7B18AF7",
    start: "2026-09-06",
  },
  [CHAIN.HYPERLIQUID]: {
    positionManager: "0x50aB3FE7d089c4F0dD8096aAeA9578f8E7B18AF7",
    start: "2026-09-06",
  },
  [CHAIN.BERACHAIN]: {
    positionManager: "0x50aB3FE7d089c4F0dD8096aAeA9578f8E7B18AF7",
    start: "2026-09-06",
  },
};

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const dailyNotionalVolume = options.createBalances();
  const dailyPremiumVolume = options.createBalances();

  const positionOpenedLogs = await options.getLogs({
    target: config[options.chain].positionManager,
    eventAbi: POSITION_OPENED,
  });

  positionOpenedLogs.forEach((log: any) => {
    dailyNotionalVolume.add(log.token, log.amount);
    dailyPremiumVolume.add(log.token, log.premium);
  });

  return { dailyNotionalVolume, dailyPremiumVolume };
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: config,
  methodology: {
    NotionalVolume: "The total value of the underlying asset in an option or derivative contract.",
    PremiumVolume: "The price paid up front to buy or sell option or derivative contract.",
  },
};

export default adapter;
