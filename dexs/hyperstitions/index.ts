import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const HYPERSTITIONS_CONTRACT = "0x97b4a6b501C55cCC7A597E259266E7E28A2d0BE0";

const BOUGHT_EVENT = "event Bought(address indexed buyer, uint256 indexed id, uint256 sharesOut, uint256 sttIn)";
const SOLD_EVENT = "event Sold(address indexed seller, uint256 indexed id, uint256 sharesIn, uint256 sttOut)";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  
  const [buyLogs, sellLogs] = await Promise.all([
    options.getLogs({ target: HYPERSTITIONS_CONTRACT, eventAbi: BOUGHT_EVENT }),
    options.getLogs({ target: HYPERSTITIONS_CONTRACT, eventAbi: SOLD_EVENT }),
  ]);

  buyLogs.forEach((log: any) => {
    dailyVolume.addCGToken("hyperstitions", Number(log.sttIn) / 1e18);
  });

  sellLogs.forEach((log: any) => {
    dailyVolume.addCGToken("hyperstitions", Number(log.sttOut) / 1e18);
  });

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.MONAD]: {
      fetch,
      start: "2025-12-03",
    },
  },
};

export default adapter;