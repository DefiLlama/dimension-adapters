import { Chain } from "@defillama/sdk/build/types";
import { CHAIN } from "../../helpers/chains";
import {
  ChainBlocks,
  FetchOptions,
  FetchResultFees,
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

const eventAbi: any = {
  anonymous: false,
  inputs: [
    {
      indexed: true,
      internalType: "address",
      name: "account",
      type: "address",
    },
    {
      indexed: true,
      internalType: "uint256",
      name: "route",
      type: "uint256",
    },
    {
      indexed: false,
      internalType: "address[]",
      name: "tokens",
      type: "address[]",
    },
    {
      indexed: false,
      internalType: "uint256[]",
      name: "amounts",
      type: "uint256[]",
    },
  ],
  name: "LogFlashloan",
  type: "event",
};

const fetchFees = (chain: Chain) => {
  return async (
    timestamp: number,
    _: ChainBlocks,
    { createBalances, getLogs }: FetchOptions,
  ): Promise<FetchResultFees> => {
    const logs: any[] = await getLogs({
      target: instaFlashAggregators[chain].address,
      eventAbi,
      topics: [
        "0xc1478ebc6913c43dfd556f53459164d7d6a0f586144857acf0e6ade0181fb510",
      ],
    });

    const dailyFees: Balances = createBalances();

    logs.map((l: any) => {
      const token = l[2][0];
      const amount = l[3][0];
      dailyFees.add(token, amount);
    });

    return {
      timestamp,
      dailyFees,
    };
  };
};

const adapter: SimpleAdapter = { adapter: {} };

Object.keys(instaFlashAggregators).forEach((chain: Chain) => {
  adapter.adapter[chain] = {
    fetch: fetchFees(chain),
    start: instaFlashAggregators[chain].deployedAt,
    runAtCurrTime: false,
    meta: {
      methodology: "Counts the 0.05% fee taken on flashswaps.",
    },
  };
});

export default adapter;
