// https://docs.openeden.com/treasury-bills-vault/fees

import { Chain } from "@defillama/sdk/build/general";
import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";
import { getTokenSupply } from '../../helpers/solana';
import { rpcCall } from '../../helpers/ripple';

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

const SOL_TBILL = '4MmJVdwYN8LwvbGeCowYjSx7KoEi6BJWg8XXnW4fDDp6';
const RIPPLE_TBILL = {
  ACCOUNT: 'rJNE2NNz83GJYtWVLwMvchDWEon3huWnFn',
  HOT_WALLET: 'rB56JZWRKvpWNeyqM3QYfZwW4fS9YEyPWM',
};

const MANAGEMENT_FEES: number = 0.003;
const DAILY_MANAGEMENT_FEES: number = MANAGEMENT_FEES / 365;

const fetch = async (
  vault: string,
  { chain, api, getLogs, createBalances }: FetchOptions
): Promise<FetchResultV2> => {
  const dailyFees = createBalances();

  let [logs, totalUSDC] = await Promise.all([
    getLogs({ target: vault, eventAbi }),
    api.call({ target: vault, abi: "uint256:totalAssets" }),
  ]);

  if (chain === CHAIN.ETHEREUM) {
    console.log({before: totalUSDC})
    
    const balanceOnSol = await getTokenSupply(SOL_TBILL)
    const rippleCallRes = await rpcCall('gateway_balances', [
      {
        account: RIPPLE_TBILL.ACCOUNT,
        hotwallet: [
          RIPPLE_TBILL.HOT_WALLET,
        ],
        ledger_index: "validated",
        strict: true
      }
    ])
    const balanceOnRipple = rippleCallRes.result && rippleCallRes.result.obligations ? Number(rippleCallRes.result.obligations.TBL) : 0
    
    // because USDC has 6 decimals on eth
    totalUSDC = Number(totalUSDC) + balanceOnSol * 1e6 + balanceOnRipple * 1e6
  }

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
      start: '2023-10-18',
    },
    [CHAIN.ARBITRUM]: {
      fetch: (options: FetchOptions) =>
        fetch(VAULT_ADDRESSES[CHAIN.ARBITRUM], options),
      start: '2024-02-13',
    },
  },
};

export default adapter;
