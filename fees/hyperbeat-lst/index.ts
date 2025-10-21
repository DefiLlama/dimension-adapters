import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const beHYPE = "0xd8FC8F0b03eBA61F64D08B0bef69d80916E5DdA9"
const beHYPE_STAKING_CORE = "0xCeaD893b162D38e714D82d06a7fe0b0dc3c38E0b"

const exchangeRatioStakingCoreAbi = "function exchangeRatio() external view returns (uint256)";

const getTotalSupply = async (options: FetchOptions, target: string) => {
  return await options.api.call({
    target: target,
    abi: "function totalSupply() external view returns (uint256)",
  });
};

const getExchangeRateBeforeAfterVaults = async (options: FetchOptions, target: string, abi: string) => {
  const [exchangeRateBefore, exchangeRateAfter] = await Promise.all([
    options.fromApi.call({ target: target, abi: abi, params: [] }),
    options.toApi.call({ target: target, abi: abi, params: [] }),
  ])

  return [exchangeRateBefore, exchangeRateAfter]
}

const fetch = async (options: FetchOptions) => {
    const dailyFees = options.createBalances();

    // // beHYPE LST vault (StakingCore)
    const totalSupply_behype = await getTotalSupply(options, beHYPE);
    const [exchangeRatioBeforeBEHYPE, exchangeRatioAfterBEHYPE] = await getExchangeRateBeforeAfterVaults(options, beHYPE_STAKING_CORE, exchangeRatioStakingCoreAbi);
    dailyFees.addCGToken('hyperliquid', (totalSupply_behype / 1e18) * (exchangeRatioAfterBEHYPE / 1e18 - exchangeRatioBeforeBEHYPE / 1e18));

    return {
      dailyFees,
      dailyRevenue: 0, // no comission from Hyperbeat
      dailySupplySideRevenue: dailyFees,
    };
};

const adapter: Adapter = {
    version: 2,
    methodology: {
      Fees: "HYPE liquid staking rewards.",
      Revenue: "No staking rewards commission for Hyperbeat.",
      SupplySideRevenue: "HYPE liquid staking rewards share for suppliers.",
    },
    fetch,
    chains: [CHAIN.HYPERLIQUID],
    start: '2025-09-05',
};

export default adapter;