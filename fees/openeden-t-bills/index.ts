// https://docs.openeden.com/treasury-bills-vault/fees

import { Chain } from "@defillama/sdk/build/general";
import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

const eventAbi = `event ProcessDeposit(
  address sender,
  address receiver,
  uint256 assets,
  uint256 shares,
  uint256 oeFee,
  uint256 pFee,
  uint256 totalFee,
  address oplTreasury,
  address treasury
)`;

const VAULT_ADDRESSES: Record<Chain, string> = {
  [CHAIN.ETHEREUM]: "0xdd50C053C096CB04A3e3362E2b622529EC5f2e8a",
  [CHAIN.ARBITRUM]: "0xF84D28A8D28292842dD73D1c5F99476A80b6666A",
};

const MANAGEMENT_FEES: number = 0.003;
const DAILY_MANAGEMENT_FEES: number = MANAGEMENT_FEES / 365;

const fetch = async (
  vault: string,
  { api, getLogs, createBalances }: FetchOptions
) => {
  const dailyFees = createBalances();

  const [logs, totalUSDC] = await Promise.all([
    getLogs({ target: vault, eventAbi }),
    api.call({ target: vault, abi: "uint256:totalAssets" }),
  ]);

  dailyFees.add(ADDRESSES[api.chain].USDC, totalUSDC * DAILY_MANAGEMENT_FEES);

  logs.forEach((log) => {
    const feeAmount = log[4];
    dailyFees.add(ADDRESSES[api.chain].USDC, feeAmount);
  });

  return { dailyFees };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: (options: FetchOptions) =>
        fetch(VAULT_ADDRESSES[CHAIN.ETHEREUM], options),
      start: 1697580000,
    },
    [CHAIN.ARBITRUM]: {
      fetch: (options: FetchOptions) =>
        fetch(VAULT_ADDRESSES[CHAIN.ARBITRUM], options),
      start: 1707778800,
    },
  },
};

export default adapter;
