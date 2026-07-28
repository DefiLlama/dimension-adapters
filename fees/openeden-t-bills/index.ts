// https://docs.openeden.com/treasury-bills-vault/fees

import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";
import { getTokenSupply } from '../../helpers/solana';
import { rpcCall } from '../../helpers/ripple';
import { METRIC } from "../../helpers/metrics";

// The vault is a proxy and ProcessDeposit has had three shapes. Each one has a
// different topic0, so all three have to be queried to cover the full history
// back to the adapter's start date. A log carries exactly one topic0, so the
// three result sets are disjoint and cannot double count.
//
//   V2  2023-10-18 to 2024-02-15  single txFee field at index 4
//   V3  2024-02-15 to 2024-12-20  oeFee/pFee/totalFee, pFee unsigned
//   V4+ 2024-12-20 onwards        same fields, pFee signed
//
// feeIndex points at the fee the contract actually transfers to oplTreasury.
const depositEvents = [
  {
    abi: `event ProcessDeposit(address sender, address receiver, uint256 assets, uint256 shares, uint256 oeFee, int256 pFee, uint256 totalFee, address oplTreasury, address treasury)`,
    feeIndex: 6,
  },
  {
    abi: `event ProcessDeposit(address sender, address receiver, uint256 assets, uint256 shares, uint256 oeFee, uint256 pFee, uint256 totalFee, address oplTreasury, address treasury)`,
    feeIndex: 6,
  },
  {
    abi: `event ProcessDeposit(address sender, address receiver, uint256 assets, uint256 shares, uint256 txFee, address oplTreasury, address treasury)`,
    feeIndex: 4,
  },
];

type TBillChainConfig = {
  target: any;
  start?: string;
  runAtCurrTime?: boolean;
};

const chainConfig: Record<string, TBillChainConfig> = {
  // https://etherscan.io/token/0xdd50C053C096CB04A3e3362E2b622529EC5f2e8a
  [CHAIN.ETHEREUM]: {
    target: "0xdd50C053C096CB04A3e3362E2b622529EC5f2e8a",
    start: '2023-10-18',
  },
  // https://arbiscan.io/token/0xF84D28A8D28292842dD73D1c5F99476A80b6666A
  [CHAIN.ARBITRUM]: {
    target: "0xF84D28A8D28292842dD73D1c5F99476A80b6666A",
    start: '2024-02-13',
  },
  // https://bscscan.com/token/0x5b4681F0d7A01B817675F25892D3Ad73572FD1D9
  // Reports name "OpenEden T-Bills", symbol TBILL. Its implementation
  // 0xf3c7bbd9f91de0664a3e2ec5063e45872da472d9 is byte-identical to the verified
  // Ethereum one apart from the immutable self-address, and underlying() returns
  // BSC USDC, matching coreAssets bsc.USDC at 18 decimals.
  [CHAIN.BSC]: {
    target: "0x5b4681F0d7A01B817675F25892D3Ad73572FD1D9",
    start: '2026-05-25',
  },
  // https://solscan.io/token/4MmJVdwYN8LwvbGeCowYjSx7KoEi6BJWg8XXnW4fDDp6
  [CHAIN.SOLANA]: {
    target: "4MmJVdwYN8LwvbGeCowYjSx7KoEi6BJWg8XXnW4fDDp6",
    runAtCurrTime: true,
  },
  // https://xrpscan.com/account/rJNE2NNz83GJYtWVLwMvchDWEon3huWnFn
  [CHAIN.RIPPLE]: {
    target: {
      ACCOUNT: 'rJNE2NNz83GJYtWVLwMvchDWEon3huWnFn',
      HOT_WALLET: 'rB56JZWRKvpWNeyqM3QYfZwW4fS9YEyPWM',
    },
    runAtCurrTime: true,
  },
};

const MANAGEMENT_FEES: number = 0.003;
const DAILY_MANAGEMENT_FEES: number = MANAGEMENT_FEES / 365;

const fetch = async (
  { chain, api, getLogs, createBalances }: FetchOptions
): Promise<FetchResultV2> => {
  const config = chainConfig[chain].target;
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
    const [logSets, totalUSDC] = await Promise.all([
      Promise.all(depositEvents.map(({ abi }) => getLogs({ target: config, eventAbi: abi }))),
      api.call({ target: config, abi: "uint256:totalAssets" }),
    ]);

    dailyFees.add(ADDRESSES[api.chain].USDC, totalUSDC * DAILY_MANAGEMENT_FEES, METRIC.MANAGEMENT_FEES);

    logSets.forEach((logs, i) => {
      // Count the fee the contract actually transfers to oplTreasury, not oeFee.
      // oeFee is the gross figure before the partnership adjustment, so on the
      // V4+ shape a negative pFee can leave oeFee large while nothing is collected.
      const { feeIndex } = depositEvents[i];
      logs.forEach((log: any) => {
        dailyFees.add(ADDRESSES[api.chain].USDC, log[feeIndex], "Transaction Fees");
      });
    });
  }

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
};

const breakdownMethodology = {
  Fees: {
    [METRIC.MANAGEMENT_FEES]: 'Management fee of 0.30% per annum accrued daily on assets under management.',
    "Transaction Fees": 'Transaction fee actually collected on subscriptions, the totalFee the vault transfers to oplTreasury. Base rate is 5 basis points, then adjusted by the partnership fee where one applies. That adjustment can raise or lower the fee, is floored at the minimum transaction fee when it is not negative, and leaves nothing collected when it fully offsets the base fee.',
  },
  Revenue: {
    [METRIC.MANAGEMENT_FEES]: 'Management fee of 0.30% per annum accrued daily on assets under management.',
    "Transaction Fees": 'Transaction fee actually collected on subscriptions, the totalFee the vault transfers to oplTreasury. Base rate is 5 basis points, then adjusted by the partnership fee where one applies. That adjustment can raise or lower the fee, is floored at the minimum transaction fee when it is not negative, and leaves nothing collected when it fully offsets the base fee.',
  },
  ProtocolRevenue: {
    [METRIC.MANAGEMENT_FEES]: 'Management fee of 0.30% per annum accrued daily on assets under management.',
    "Transaction Fees": 'Transaction fee actually collected on subscriptions, the totalFee the vault transfers to oplTreasury. Base rate is 5 basis points, then adjusted by the partnership fee where one applies. That adjustment can raise or lower the fee, is floored at the minimum transaction fee when it is not negative, and leaves nothing collected when it fully offsets the base fee.',
  },
}


const adapter: Adapter = {
  methodology: {
    Fees: 'Management fee of 0.30% per annum accrued daily on assets under management, plus the transaction fee collected on subscriptions (base rate 5 basis points, net of any partnership adjustment up or down).',
    Revenue: 'Management fees of 0.30% per annum accrued daily on assets under management and the transaction fee collected on subscriptions (base rate 5 basis points, net of any partnership adjustment up or down).',
    ProtocolRevenue: 'Management fees of 0.30% per annum accrued daily on assets under management and the transaction fee collected on subscriptions (base rate 5 basis points, net of any partnership adjustment up or down).',
  },
  breakdownMethodology,
  version: 2,
  // pullHourly must stay false: the management fee is a window-independent snapshot
  // (totalAssets * MANAGEMENT_FEES/365), so running 24 hourly pulls would charge a
  // full day's management fee 24 times and overstate fees/revenue.
  pullHourly: false,
  adapter: {},
};

for (const [chain, { start, runAtCurrTime }] of Object.entries(chainConfig)) {
  (adapter.adapter as any)[chain] = {
    fetch,
    ...(start ? { start } : {}),
    ...(runAtCurrTime ? { runAtCurrTime } : {}),
  };
}

export default adapter;
