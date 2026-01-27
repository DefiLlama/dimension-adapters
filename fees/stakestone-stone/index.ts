import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { ChainApi } from "@defillama/sdk";

const STONE_VAULT = "0xa62f9c5af106feee069f38de51098d9d81b90572"
const STONE_TOKEN = "0x7122985656e38bdc0302db86685bb972b145bd3c"

const DECIMALS = 10n ** 18n;

const abi = {
  currentSharePrice: "function currentSharePrice() external view returns (uint256)",
  withdrawingSharesInPast: "function withdrawingSharesInPast() external view returns (uint256)",
  totalSupply: "function totalSupply() external view returns (uint256)",
}

async function getVaultState(api: ChainApi): Promise<{ sharePrice: string, totalSupply: string, withdrawingShares: string }> {
  const [sharePrice, totalSupply, withdrawingShares] = await Promise.all([
    api.call({
      target: STONE_VAULT,
      abi: abi.currentSharePrice,
    }),
    api.call({
      target: STONE_TOKEN,
      abi: abi.totalSupply,
    }),
    api.call({
      target: STONE_VAULT,
      abi: abi.withdrawingSharesInPast,
    }),
  ]);
  return { sharePrice, totalSupply, withdrawingShares };
}

const fetch = async (options: FetchOptions) => {
  const { createBalances, api, fromApi } = options;

  const startState = await getVaultState(fromApi);
  const endState = await getVaultState(api);

  const sharePriceStart = BigInt(startState.sharePrice);
  const sharePriceEnd = BigInt(endState.sharePrice);

  const totalSupplyStart = BigInt(startState.totalSupply);
  const withdrawingSharesStart = BigInt(startState.withdrawingShares);
  const activeSharesStart = totalSupplyStart - withdrawingSharesStart;

  const priceIncrease = sharePriceEnd - sharePriceStart;

  const dailyEthRewards = (priceIncrease * activeSharesStart) / DECIMALS;

  const dailyFees = createBalances()
  dailyFees.addGasToken(dailyEthRewards);

  return {
    dailyFees
  }
}

const adapter: SimpleAdapter = {
  methodology: {
    dailyFees: "Staking rewards earned by all staked ETH",
  },
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch,
    }
  }
};

export default adapter;