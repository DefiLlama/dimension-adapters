import { Chain } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { 
  FetchV2, 
  SimpleAdapter,
} from "../../adapters/types";
import { Balances } from "@defillama/sdk";

const instaFlashAggregators: {
  [chain: Chain]: { address: string; deployedAt: number };
} = {
  [CHAIN.ETHEREUM]: {
    address: "0x619Ad2D02dBeE6ebA3CDbDA3F98430410e892882",
    deployedAt: 1638144000,
  },
  [CHAIN.POLYGON]: {
    address: "0xB2A7F20D10A006B0bEA86Ce42F2524Fde5D6a0F4",
    deployedAt: 1638230400,
  },
  [CHAIN.AVAX]: {
    address: "0x2b65731A085B55DBe6c7DcC8D717Ac36c00F6d19",
    deployedAt: 1638230400,
  },
  [CHAIN.ARBITRUM]: {
    address: "0x1f882522DF99820dF8e586b6df8bAae2b91a782d",
    deployedAt: 1638230400,
  },
  // [CHAIN.FANTOM]: 'NA',
  [CHAIN.OPTIMISM]: {
    address: "0x84e6b05a089d5677a702cf61dc14335b4be5b282",
    deployedAt: 1646784000,
  },
};

const eventAbi: any = "event LogFlashloan(address indexed account, uint256 indexed route, address[] tokens, uint256[] amounts)";

const fetch: FetchV2 = async ({ createBalances, getLogs, chain }) => {
  const target = instaFlashAggregators[chain].address;
  const dailyFees: Balances = createBalances();

  const logs: any[] = await getLogs({
    target,
    eventAbi,
    topics: [
      "0xc1478ebc6913c43dfd556f53459164d7d6a0f586144857acf0e6ade0181fb510",
    ],
  });

  const fee = 5;
  // const fee = await call({
  //   target,
  //   abi: "function InstaFeeBPS() external view returns (uint256)",
  // });

  logs.map((l: any) => {
    dailyFees.add(l.tokens, l.amounts);
  });

  dailyFees.resizeBy(fee / 10000);

  return {
    dailyFees,
  };
};

const adapter: SimpleAdapter = { adapter: {}, version: 2, pullHourly: true, };

Object.keys(instaFlashAggregators).forEach((chain: Chain) => {
  adapter.adapter![chain] = {
    fetch,
    start: instaFlashAggregators[chain].deployedAt,
  };
});

adapter.methodology = "Counts the 0.05% fee taken on flashswaps."
export default adapter;
