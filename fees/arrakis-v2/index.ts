import { Chain } from "../../adapters/types";
import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

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
  managerFeeBPS: "uint16:managerFeeBPS",
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

async function fetch({ chain, api, fromApi, toApi, createBalances }: FetchOptions) {
  const { helper, factory } = contracts[chain];
  const dailyFees = createBalances();
  const dailySupplySideRevenue = createBalances();
  const dailyRevenue = createBalances();

  const limit = await api.call({ target: factory, abi: abi.numVaults });
  const vaults = await api.call({
    target: factory,
    abi: abi.vaults,
    params: [0, limit],
  });

  const calls = vaults.map((v: string) => ({ target: helper, params: [v] }));

  const [token0s, token1s, managerFeeBPSs, prevBals, currBals] = await Promise.all([
    api.multiCall({ calls: vaults, abi: abi.token0, permitFailure: true }),
    api.multiCall({ calls: vaults, abi: abi.token1, permitFailure: true }),
    api.multiCall({ calls: vaults, abi: abi.managerFeeBPS, permitFailure: true }),
    fromApi.multiCall({ calls, abi: abi.fees, permitFailure: true }),
    toApi.multiCall({ calls, abi: abi.fees, permitFailure: true }),
  ]);

  vaults.forEach((_: string, index: number) => {
    const token0 = token0s[index];
    const token1 = token1s[index];
    const mgrBPS = BigInt(managerFeeBPSs[index] ?? 0);

    const prevFee0 = prevBals[index]?.fee0 ?? 0;
    const currFee0 = currBals[index]?.fee0;
    const prevFee1 = prevBals[index]?.fee1 ?? 0;
    const currFee1 = currBals[index]?.fee1;

    if (token0 && currFee0 !== undefined) {
      const delta0 = BigInt(currFee0) - BigInt(prevFee0);
      if (delta0 > 0n) {
        const managerCut0 = (delta0 * mgrBPS) / 10000n;
        dailyFees.add(token0, delta0, METRIC.LP_FEES);
        dailySupplySideRevenue.add(token0, delta0 - managerCut0, 'LP Fees To Depositors');
        dailySupplySideRevenue.add(token0, managerCut0, 'LP Fees To Vaults Managers');
      }
    }

    if (token1 && currFee1 !== undefined) {
      const delta1 = BigInt(currFee1) - BigInt(prevFee1);
      if (delta1 > 0n) {
        const managerCut1 = (delta1 * mgrBPS) / 10000n;
        dailyFees.add(token1, delta1, METRIC.LP_FEES);
        dailySupplySideRevenue.add(token1, delta1 - managerCut1, 'LP Fees To Depositors');
        dailySupplySideRevenue.add(token1, managerCut1, 'LP Fees To Vaults Managers');
      }
    }
  });

  return { dailyFees, dailySupplySideRevenue, dailyRevenue: 0 };
}

const methodology = {
  Fees: 'Gross Uniswap V3 LP fees accrued across all ArrakisV2 vault positions before management fees cut.',
  SupplySideRevenue: 'Depositors share of accrued fees: gross fees minus management fees per vault + fees paid to vaults managers.',
  Revenue: 'No protocol revenue.',
};

const breakdownMethodology = {
  Fees: {
    [METRIC.LP_FEES]: 'Uniswap V3 trading fees accrued to vault LP positions',
  },
  SupplySideRevenue: {
    'LP Fees To Depositors': 'Uniswap V3 fees remaining in vault after manager fee is subtracted',
    'LP Fees To Vaults Managers': 'Uniswap V3 fees allocated to vaults managers',
  },
};

const adapter: Adapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: '2023-08-26',
  methodology,
  breakdownMethodology,
};

export default adapter;
