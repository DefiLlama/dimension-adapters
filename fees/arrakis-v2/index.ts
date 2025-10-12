import { Chain } from "../../adapters/types";
import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

type IVault = {
  helper: string;
  factory: string;
};

type IAddress = {
  [s: string | Chain]: IVault;
};

const abi = {
  numVaults: "uint256:numVaults",
  vaults:
    "function vaults(uint256 startIndex_, uint256 endIndex_) returns (address[] memory)",
  token0: "address:token0",
  token1: "address:token1",
  fees: "function totalUnderlyingWithFees(address vault_) external view returns (uint256 amount0, uint256 amount1, uint256 fee0, uint256 fee1)",
};

const contracts: IAddress = {
  [CHAIN.ETHEREUM]: {
    helper: "0x89E4bE1F999E3a58D16096FBe405Fc2a1d7F07D6",
    factory: "0xECb8Ffcb2369EF188A082a662F496126f66c8288",
  },
  [CHAIN.POLYGON]: {
    helper: "0x89E4bE1F999E3a58D16096FBe405Fc2a1d7F07D6",
    factory: "0xECb8Ffcb2369EF188A082a662F496126f66c8288",
  },
  [CHAIN.OPTIMISM]: {
    helper: "0x89E4bE1F999E3a58D16096FBe405Fc2a1d7F07D6",
    factory: "0xECb8Ffcb2369EF188A082a662F496126f66c8288",
  },
  [CHAIN.BASE]: {
    helper: "0x89E4bE1F999E3a58D16096FBe405Fc2a1d7F07D6",
    factory: "0xECb8Ffcb2369EF188A082a662F496126f66c8288",
  },
  [CHAIN.ARBITRUM]: {
    helper: "0x89E4bE1F999E3a58D16096FBe405Fc2a1d7F07D6",
    factory: "0xECb8Ffcb2369EF188A082a662F496126f66c8288",
  },
};

async function getVaultsFees(
  { api, fromApi, toApi, createBalances }: FetchOptions,
  { helper, factory }: IVault
) {
  const dailyFees = createBalances();

  const limit = await api.call({ target: factory, abi: abi.numVaults });
  const vaults = await api.call({
    target: factory,
    abi: abi.vaults,
    params: [0, limit],
  });

  const calls = vaults.map((v: string) => ({ target: helper, params: [v] }));

  const [token0s, token1s, prevBals, currBals] = await Promise.all([
    api.multiCall({ calls: vaults, abi: abi.token0, permitFailure: true }),
    api.multiCall({ calls: vaults, abi: abi.token1, permitFailure: true }),
    fromApi.multiCall({ calls, abi: abi.fees, permitFailure: true }),
    toApi.multiCall({ calls, abi: abi.fees, permitFailure: true }),
  ]);

  vaults.forEach((_: string, index: number) => {
    const token0 = token0s[index];
    const prevFee0 = prevBals[index]?.fee0 ?? 0;
    const currFee0 = currBals[index].fee0;

    const token1 = token1s[index];
    const prevFee1 = prevBals[index]?.fee1 ?? 0;
    const currFee1 = currBals[index].fee1;

    if (token0 && prevFee0 && currFee0) {
      const dailyFee0 = BigInt(currFee0) - BigInt(prevFee0);
      if (dailyFee0 >= 0) {
        dailyFees.add(token0, dailyFee0);
      }
    }

    if (token1 && prevFee1 && currFee1) {
      const dailyFee1 = BigInt(currFee1) - BigInt(prevFee1);
      if (dailyFee1 >= 0) {
        dailyFees.add(token1, dailyFee1);
      }
    }
  });

  return { dailyFees };
}

const adapter: Adapter = {
  methodology: {
    Fees: 'All yields are collected from deposited assets by liquidity providers.',
  },
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: (options: FetchOptions) =>
        getVaultsFees(options, contracts[CHAIN.ETHEREUM]),
      start: '2023-08-26',
    },
  },
  version: 2,
};

export default adapter;
