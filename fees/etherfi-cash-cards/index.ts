import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const MetricLabels = {
    CASH_TRANSACTION_FEES: 'Cash Transaction Fees',
    CASHBACKS: 'Cashbacks'
};

const config: any = {
  [CHAIN.SCROLL]: {
    "cashSpends": [
        {
            eventAbi: "event Spend (address indexed userSafe, address indexed token, uint256 amount, uint256 amountInUsd, uint8 mode)",
            targets: ["0x5423885B376eBb4e6104b8Ab1A908D350F6A162e", "0x380B2e96799405be6e3D965f4044099891881acB"]
        },
        {
            eventAbi: "event Spend (address indexed safe,bytes32 indexed txId, address indexed token, uint256 amount, uint256 amountInUsd, uint8 mode)",
            targets: ["0x380B2e96799405be6e3D965f4044099891881acB"]
        },
        {
            eventAbi: "event Spend (address indexed safe, bytes32 indexed txId,uint8 indexed binSponsor, address[] tokens, uint256[] amounts, uint256[] amountInUsd, uint256 totalUsdAmt, uint8 mode)",
            targets: ["0x380B2e96799405be6e3D965f4044099891881acB"]
        },
    ],
    "cashBacks": [
        {
            eventAbi: "event Cashback (address indexed userSafe, uint256 spendingInUsd, address indexed cashbackToken, uint256 cashbackAmount, uint256 cashbackInUsd, bool paid)",
            targets: ["0x5423885B376eBb4e6104b8Ab1A908D350F6A162e"]
        },
        {
            eventAbi: "event Cashback (address indexed safe,address indexed spender, uint256 spendingInUsd, address cashbackToken, uint256 cashbackAmountToSafe, uint256 cashbackInUsdToSafe, uint256 cashbackAmountToSpender, uint256 cashbackInUsdToSpender, bool indexed paid)",
            targets: ["0x380B2e96799405be6e3D965f4044099891881acB"]
        },
        {
            eventAbi: "event Cashback (address indexed safe, uint256 spendingInUsd, address indexed recipient, address cashbackToken, uint256 cashbackAmountInToken, uint256 cashbackInUsd, uint8 cashbackType, bool indexed paid)",
            targets: ["0x380B2e96799405be6e3D965f4044099891881acB"]
        },
        {
            eventAbi: "event Cashback (address indexed safe, uint256 spendingInUsd, address indexed recipient, address cashbackToken, uint256 cashbackAmountInToken, uint256 cashbackInUsd, uint256 cashbackType, bool indexed paid)",
            targets: ["0x380B2e96799405be6e3D965f4044099891881acB"]
        },
    ]
  },
  [CHAIN.OPTIMISM]: {
    "cashSpends": [
        {
            eventAbi: "event Spend (address indexed safe, bytes32 indexed txId,uint8 indexed binSponsor, address[] tokens, uint256[] amounts, uint256[] amountInUsd, uint256 totalUsdAmt, uint8 mode)",
            targets: ["0x380B2e96799405be6e3D965f4044099891881acB"]
        },
    ],
    "cashBacks": [
        {
            eventAbi: "event Cashback (address indexed safe, uint256 spendingInUsd, address indexed recipient, address cashbackToken, uint256 cashbackAmountInToken, uint256 cashbackInUsd, uint256 cashbackType, bool indexed paid)",
            targets: ["0x380B2e96799405be6e3D965f4044099891881acB"]
        },
    ],
    // ETHFI cashback (since 2026-09-03), paid by ether.fi's CashbackDistributor from its own balance, which the treasury tops up.
    //
    // Why this is a cost of the card business and not an incentive or a holders buyback:
    // ether.fi DAO proposal "Programmatic ETHFI Buybacks & Ecosystem Growth" (Snapshot etherfi-dao.eth,
    // 0xed61adff5103b4e50be49b28fca8ecbbea9d685141d2d5a34d1d24232ac91891, passed 2026-09-03, 1.14M For / 0 Against):
    // - Labs forwards a share of card interchange, swap and staking revenue each week as USDC to a Foundation Safe, which buys
    //   ETHFI with TWAP orders on CoW Swap. On-chain: USDC from 0xf40bcc0845528873784f36e5c105e62a93ff7021 to
    //   0x43f4ca92f7f378bcdcf1508b866b5b6c47d6408c, which sold 1.5M USDC for 2.2M ETHFI on CoW between 2026-09-08 and 2026-11-03,
    //   bridged it to Optimism (LayerZero OFT) and funded this distributor.
    // - "Every reward on ether.fi will be paid in ETHFI ... Card cashback will be ... paid in ETHFI acquired on the open market and
    //   funded from card revenue, staking revenue, and the fee funded buyback pool". "No new ETHFI is minted", so it is not an
    //   emission and does not belong in incentives/.
    // - Up to 20M ETHFI of existing Foundation holdings may top up shortfalls. So far distributions (3.4M ETHFI to early Nov 2026)
    //   exceed purchases (2.2M), so nothing has accumulated for holders and the buffer is being drawn.
    // The ETHFI handed to card users is therefore card revenue converted into cashback: Fees and SupplySideRevenue here, same as
    // the Cash-contract cashback leg.
    // It is not holders revenue: it is spent on users, and fees/ether-fi-stake only counts buybacks that land in the Foundation
    // wallet 0x2f5301a3D59388c509C65f8698f521377D41Fd0F, which these purchases do not (different buyer Safe), so there is no overlap.
    // https://github.com/etherfi-protocol/cash-v3/blob/ac89a4b94db4bd0c0b5dc0421137dd3afa1d7bc1/deployments/mainnet/10/deployments.json#L40
    // https://github.com/etherfi-protocol/cash-v3/blob/ac89a4b94db4bd0c0b5dc0421137dd3afa1d7bc1/src/cashback-distributor/CashbackDistributor.sol#L196-L211
    // sample award: 0xb11949c514c7d91ee38f198c24994d8976c8d9810ebffa64cc5778bcf4a534cd (18.12 ETHFI to a card user's safe)
    "cashbackAwards": [
        {
            eventAbi: "event CashbackAwarded (bytes32 indexed claimId, address indexed recipient, address indexed token, uint256 amount, uint256 sEthfiAmount)",
            targets: ["0x38F2fBb259F042DE3A601E0f7135f768DE08F5A2"]
        },
    ]
  }
};

const fetch = async (options: FetchOptions) => {
    const dailyVolume = options.createBalances();
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    for (const { eventAbi, targets } of config[options.chain].cashSpends) {
        const logs = await options.getLogs({
            eventAbi,
            targets
        });
        logs.forEach(log => {
            for (const amount of log.amountInUsd) {
              if (amount > 0) {
                    dailyVolume.addUSDValue(Number(amount) / 1e6);
                
                    //Cash transaction fees(1.38 % on card spends) - protocol revenue
                    dailyFees.addUSDValue(Number(amount) * 0.0138 / 1e6, MetricLabels.CASH_TRANSACTION_FEES);
                    dailyRevenue.addUSDValue(Number(amount) * 0.0138 / 1e6, MetricLabels.CASH_TRANSACTION_FEES);
                }
            }
        })
    }
    for (const { eventAbi, targets } of config[options.chain].cashBacks) {
        const logs = await options.getLogs({
            eventAbi,
            targets
        });
        logs.forEach(log => {
            if (log.cashbackInUsd > 0) {
                dailyFees.addUSDValue(Number(log.cashbackInUsd) / 1e6, MetricLabels.CASHBACKS);
                dailySupplySideRevenue.addUSDValue(Number(log.cashbackInUsd) / 1e6, MetricLabels.CASHBACKS);
            }
        })
    }
    for (const { eventAbi, targets } of config[options.chain].cashbackAwards ?? []) {
        const logs = await options.getLogs({
            eventAbi,
            targets
        });
        logs.forEach(log => {
            // award(): `amount` of `token` is paid. awardStaked(): `token` is sETHFI, and the shares paid are `sEthfiAmount`
            const amount = log.sEthfiAmount > 0 ? log.sEthfiAmount : log.amount;
            // Booked like the Cash-contract cashback above: in Fees and SupplySideRevenue, revenue untouched.
            // The event has no product tag: the distributor also pays ether.fi's trade and borrow cashback. Over 2026-09-17..11-01,
            // awards beyond 4% of each recipient's own card spend, plus awards to safes with no card spend, were 0.7% of the total.
            dailyFees.add(log.token, amount, MetricLabels.CASHBACKS);
            dailySupplySideRevenue.add(log.token, amount, MetricLabels.CASHBACKS);
        })
    }

  return {
        dailyVolume,
        dailyFees,
        dailyRevenue,
        dailyProtocolRevenue: dailyRevenue,
        dailySupplySideRevenue,
        dailyHoldersRevenue: 0,
    };
};

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    fetch,
    adapter: {
      [CHAIN.SCROLL]: {
        start: '2024-11-01',
      },
      [CHAIN.OPTIMISM]: {
        start: '2026-04-08',
      },
    },
    methodology: {
        Volume: "Card spending volume on EtherFi Cash.",
        Fees: "Estimated 1.38% transaction fee on EtherFi Cash card spending, plus cashback paid to card users.",
        Revenue: "Estimated 1.38% transaction fee on card spending.",
        ProtocolRevenue: "Estimated 1.38% transaction fee on card spending, kept by ether.fi.",
        SupplySideRevenue: "Cashback paid to card users: stablecoin or ETH cashback through the Cash contract, and ETHFI cashback bought with card revenue and paid through the CashbackDistributor.",
        HoldersRevenue: "No revenue is distributed to ETHFI holders.",
    },
    breakdownMethodology: {
        Fees: {
            [MetricLabels.CASH_TRANSACTION_FEES]: 'Estimated 1.38% transaction fee on card spending',
            [MetricLabels.CASHBACKS]: 'Cashback paid to card users through the Cash contract and ETHFI cashback through the CashbackDistributor',
        },
        Revenue: {
            [MetricLabels.CASH_TRANSACTION_FEES]: 'Estimated 1.38% transaction fee on card spending',
        },
        ProtocolRevenue: {
            [MetricLabels.CASH_TRANSACTION_FEES]: 'Estimated 1.38% transaction fee on card spending',
        },
        SupplySideRevenue: {
            [MetricLabels.CASHBACKS]: 'Cashback paid to card users through the Cash contract and ETHFI cashback through the CashbackDistributor',
        },
    },
    unknownBreakdownMethodology: {
        SupplySideRevenue: {
            'FX & cross-border costs': 'Paid offchain and vary by region and charge type, so the amount cannot be measured onchain.',
            'Card issuer & network costs': 'Revenue is estimated at 1.38% of card spend. Card issuer and network (Visa) fees come out of this, plus fees ether.fi pays its card program provider, Rain. All set in private contracts and paid offchain.',
        },
    },
};

export default adapter;