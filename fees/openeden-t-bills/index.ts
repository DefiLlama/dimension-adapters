// https://docs.openeden.com/treasury-bills-vault/fees

import { Chain } from "../../adapters/types";
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

const CHAIN_CONFIGS: any = {
  [CHAIN.ETHEREUM]: "0xdd50C053C096CB04A3e3362E2b622529EC5f2e8a",
  [CHAIN.ARBITRUM]: "0xF84D28A8D28292842dD73D1c5F99476A80b6666A",
  [CHAIN.SOLANA]: "4MmJVdwYN8LwvbGeCowYjSx7KoEi6BJWg8XXnW4fDDp6",
  [CHAIN.RIPPLE]: {
    ACCOUNT: 'rJNE2NNz83GJYtWVLwMvchDWEon3huWnFn',
    HOT_WALLET: 'rB56JZWRKvpWNeyqM3QYfZwW4fS9YEyPWM',
  },
};

const MANAGEMENT_FEES: number = 0.003;
const DAILY_MANAGEMENT_FEES: number = MANAGEMENT_FEES / 365;

const fetch = async (
  config: any,
  { chain, api, getLogs, createBalances }: FetchOptions
): Promise<FetchResultV2> => {
  const dailyFees = createBalances();

  if (chain === CHAIN.RIPPLE) {
    const rippleCallRes = await rpcCall('gateway_balances', [
      {
        account: config.ACCOUNT,
        hotwallet: [
          config.HOT_WALLET,
        ],
        ledger_index: "validated",
        strict: true
      }
    ])
    const balanceOnRipple = rippleCallRes.result && rippleCallRes.result.obligations ? Number(rippleCallRes.result.obligations.TBL) : 0
    dailyFees.addUSDValue(balanceOnRipple * DAILY_MANAGEMENT_FEES)
  } else if (chain === CHAIN.SOLANA) {
    dailyFees.addUSDValue((await getTokenSupply(config)) * DAILY_MANAGEMENT_FEES)
  } else {
    let [logs, totalUSDC] = await Promise.all([
      getLogs({ target: config, eventAbi }),
      api.call({ target: config, abi: "uint256:totalAssets" }),
    ]);

    dailyFees.add(ADDRESSES[api.chain].USDC, totalUSDC * DAILY_MANAGEMENT_FEES);

    logs.forEach((log) => {
      const feeAmount = log[4];
      dailyFees.add(ADDRESSES[api.chain].USDC, feeAmount);
    });
  }

  return { dailyFees };
};

const adapter: Adapter = {
  methodology: {
    Fees: 'All yields collected from invested assets.',
  },
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: (options: FetchOptions) =>
        fetch(CHAIN_CONFIGS[CHAIN.ETHEREUM], options),
      start: '2023-10-18',
    },
    [CHAIN.ARBITRUM]: {
      fetch: (options: FetchOptions) =>
        fetch(CHAIN_CONFIGS[CHAIN.ARBITRUM], options),
      start: '2024-02-13',
    },
    [CHAIN.RIPPLE]: {
      fetch: (options: FetchOptions) =>
        fetch(CHAIN_CONFIGS[CHAIN.RIPPLE], options),
      runAtCurrTime: true,
    },
    [CHAIN.SOLANA]: {
      fetch: (options: FetchOptions) =>
        fetch(CHAIN_CONFIGS[CHAIN.SOLANA], options),
      runAtCurrTime: true,
    },
  },
};

export default adapter;
