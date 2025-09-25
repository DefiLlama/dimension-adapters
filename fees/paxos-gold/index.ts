import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const PAXG = "0x45804880de22913dafe09f4980848ece6ecbaf78";

const eventAbi = `event FeeCollected(
  address indexed from,
  address indexed to,
  uint256 value
)`;

const fetch = async ({
  getLogs,
  createBalances,
}: FetchOptions): Promise<FetchResultV2> => {
  const dailyFees = createBalances();
  const logs = await getLogs({ target: PAXG, eventAbi });

  logs.forEach(([_from, _to, fee]) => {
    dailyFees.add(PAXG, fee);
  });

  return { dailyFees };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2024-01-01',
    },
  },
  methodology: {
    Fees: "Fees paid by users while transferring PAXG token.",
  }
};

export default adapter;
