// https://docs.openeden.com/treasury-bills-vault/fees

import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";
import { getTokenSupply } from '../../helpers/solana';
import { rpcCall } from '../../helpers/ripple';
import { METRIC } from "../../helpers/metrics";

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
    dailyFees.addUSDValue(balanceOnRipple * DAILY_MANAGEMENT_FEES, METRIC.MANAGEMENT_FEES)
  } else if (chain === CHAIN.SOLANA) {
    dailyFees.addUSDValue((await getTokenSupply(config)) * DAILY_MANAGEMENT_FEES, METRIC.MANAGEMENT_FEES)
  } else {
    let [logs, totalUSDC] = await Promise.all([
      getLogs({ target: config, eventAbi }),
      api.call({ target: config, abi: "uint256:totalAssets" }),
    ]);

    dailyFees.add(ADDRESSES[api.chain].USDC, totalUSDC * DAILY_MANAGEMENT_FEES, METRIC.MANAGEMENT_FEES);

    logs.forEach((log) => {
      const feeAmount = log[4];
      dailyFees.add(ADDRESSES[api.chain].USDC, feeAmount, "Transaction Fees");
    });
  }

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
};

const breakdownMethodology = {
  Fees: {
    [METRIC.MANAGEMENT_FEES]: 'Management fee of 0.30% per annum accrued daily on assets under management.',
    "Transaction Fees": 'Transaction fees (5 basis points) charged on subscriptions/redemptions used to cover operational costs.',
  },
  Revenue: {
    [METRIC.MANAGEMENT_FEES]: 'Management fee of 0.30% per annum accrued daily on assets under management.',
    "Transaction Fees": 'Transaction fees (5 basis points) charged on subscriptions/redemptions used to cover operational costs.',
  },
  ProtocolRevenue: {
    [METRIC.MANAGEMENT_FEES]: 'Management fee of 0.30% per annum accrued daily on assets under management.',
    "Transaction Fees": 'Transaction fees (5 basis points) charged on subscriptions/redemptions used to cover operational costs.',
  },
}


const adapter: Adapter = {
  methodology: {
    Fees: 'Management fee of 0.30% per annum accrued daily on assets under management, plus the OpenEden transaction fee (oeFee) of 5 basis points charged on subscriptions/redemptions used to cover operational costs.',
    Revenue: 'Management fees of 0.30% per annum accrued daily on assets under management and transaction fees (5 basis points) charged on subscriptions/redemptions used to cover operational costs.',
    ProtocolRevenue: 'Management fees of 0.30% per annum accrued daily on assets under management and transaction fees (5 basis points) charged on subscriptions/redemptions used to cover operational costs.',
  },
  breakdownMethodology,
  version: 2,
  // pullHourly must stay false: the management fee is a window-independent snapshot
  // (totalAssets * MANAGEMENT_FEES/365), so running 24 hourly pulls would charge a
  // full day's management fee 24 times and overstate fees/revenue.
  pullHourly: false,
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
