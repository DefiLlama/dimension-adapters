import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const USDT_BSC = "0x55d398326f99059fF775485246999027B3197955";

const CONTRACTS = {
  EXCHANGES: [
    "0x8BC070BEdAB741406F4B1Eb65A72bee27894B689",
    "0x6beb5a40c032afc305961162d8204cda16decfa5",
    "0x365fb81bd4A24D6303cd2F19c349dE6894D8d58A",
    "0x8a289d458f5a134ba40015085a8f50ffb681b41d",
  ],
  FEE_MODULES_OLD: [
    "0xF1f8F5C641F20C48526269EF7DFF19172Efa9783",
    "0xFBC2259Abb3f01c019ecE1d0200eE673Bb7BA34f",
    "0xF2311C668aAA8dEc48D5da577d3018eb94b3132F",
    "0xd172f3fbabe763ee8e52d8b32421574236da6057",
  ],
  FEE_MODULES_NEW: [
    "0x0989942f8E5b778E804858A0cC791b4469A5fD63",
    "0xf291a67165d751a2e7b4da4f0a012449eef0a279",
    "0xdcffeb0c30263888a48485a664ec9563a54891a1",
  ]
};

const EVENTS = {
  FEE_REFUNDED_OLD: "event FeeRefunded(bytes32 indexed orderHash, address indexed to, uint256 id, uint256 refund, uint256 indexed feeCharged)",
  FEE_REFUNDED_NEW: "event FeeRefunded(bytes32 indexed orderHash, address indexed to, uint256 id, uint256 refund, uint256 feeCharged)",
  ORDER_FILLED: "event OrderFilled(bytes32 indexed orderHash, address indexed maker, address indexed taker, uint256 makerAssetId, uint256 takerAssetId, uint256 makerAmountFilled, uint256 takerAmountFilled, uint256 fee)",
  MAKER_REBATE_DISTRIBUTED: "event MakerRebateDistributed(address indexed maker, uint256 indexed takerFeeTokenId, uint256 rebateAmount)",
  REFERRAL_FEE_DISTRIBUTED: "event ReferralFeeDistributed(address indexed referrer,uint256 indexed takerFeeTokenId, uint256 amount)"
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const isUSDT = (id: any) => String(id) === "0";

  const orderFilledLogs = await options.getLogs({
    targets: CONTRACTS.EXCHANGES,
    eventAbi: EVENTS.ORDER_FILLED,
    flatten: true,
  })

  const feeRefundedLogsOld = await options.getLogs({
    targets: CONTRACTS.FEE_MODULES_OLD,
    eventAbi: EVENTS.FEE_REFUNDED_OLD,
    flatten: true,
  })

  const feeRefundedLogsNew = await options.getLogs({
    targets: CONTRACTS.FEE_MODULES_NEW,
    eventAbi: EVENTS.FEE_REFUNDED_NEW,
    flatten: true,
  })

  const makerRebateDistributedLogs = await options.getLogs({
    targets: CONTRACTS.FEE_MODULES_NEW,
    eventAbi: EVENTS.MAKER_REBATE_DISTRIBUTED,
    flatten: true,
  })

  const referralFeeDistributedLogs = await options.getLogs({
    targets: [...CONTRACTS.FEE_MODULES_OLD, ...CONTRACTS.FEE_MODULES_NEW],
    eventAbi: EVENTS.REFERRAL_FEE_DISTRIBUTED,
    flatten: true,
  })

  const tokensToLatestPriceMap = new Map<string, number>();

  for (const log of orderFilledLogs) {
    const token = isUSDT(log.takerAssetId) ? log.makerAssetId : log.takerAssetId;
    const tokenPriceInUsd = isUSDT(log.takerAssetId) ? (Number(log.takerAmountFilled) / Number(log.makerAmountFilled)) : (Number(log.makerAmountFilled) / Number(log.takerAmountFilled));

    tokensToLatestPriceMap.set(`${token}`, tokenPriceInUsd);

    const feeInUsd = isUSDT(log.takerAssetId) ? log.fee : Number(log.fee) * tokenPriceInUsd;
    dailyFees.add(USDT_BSC, feeInUsd, METRIC.TRADING_FEES);
  }

  for (const log of [...feeRefundedLogsOld, ...feeRefundedLogsNew]) {
    if (isUSDT(log.id)) {
      dailySupplySideRevenue.add(USDT_BSC, log.refund, "Trading Fee Refund");
    }
    else {
      const tokenPrice = tokensToLatestPriceMap.get(`${log.id}`) ?? 0;
      dailySupplySideRevenue.add(USDT_BSC, Number(log.refund) * tokenPrice, "Trading Fee Refund");
    }
  }


  for (const log of makerRebateDistributedLogs) {
    if (isUSDT(log.takerFeeTokenId)) {
      dailySupplySideRevenue.add(USDT_BSC, log.rebateAmount, "Maker Rebate");
    }
    else {
      const tokenPrice = tokensToLatestPriceMap.get(`${log.takerFeeTokenId}`) ?? 0;
      dailySupplySideRevenue.add(USDT_BSC, Number(log.rebateAmount) * tokenPrice, "Maker Rebate");
    }
  }

  for (const log of referralFeeDistributedLogs) {
    if (isUSDT(log.takerFeeTokenId)) {
      dailySupplySideRevenue.add(USDT_BSC, log.amount, "Referral Fee");
    }
    else {
      const tokenPrice = tokensToLatestPriceMap.get(`${log.takerFeeTokenId}`) ?? 0;
      dailySupplySideRevenue.add(USDT_BSC, Number(log.amount) * tokenPrice, "Referral Fee");
    }
  }

  const revenue = dailyFees.clone()
  revenue.subtract(dailySupplySideRevenue);

  const dailyRevenue = revenue.clone(1, "Trading Fees to Protocol");

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Trading fees charged on prediction market trades. Fees are collected in the taker token; non-USDT tokens are converted to USD using the trade price at the relevant hour.",
  Revenue: "Trading fees retained by the protocol after refunds, maker rebates, and referral fees are distributed to the supply side.",
  ProtocolRevenue: "Trading fees retained by the protocol after refunds, maker rebates, and referral fees are distributed to the supply side.",
  SupplySideRevenue: "Trading fees distributed as refunds, maker rebates, and referral fees."
};

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: "Trading fees charged on prediction market trades. Fees are collected in the taker token; non-USDT tokens are converted to USD using the trade price at the relevant hour.",
  },
  Revenue: {
    "Trading Fees to Protocol": "Trading fees retained by the protocol after refunds, maker rebates, and referral fees are distributed to the supply side.",
  },
  ProtocolRevenue: {
    "Trading Fees to Protocol": "Trading fees retained by the protocol after refunds, maker rebates, and referral fees are distributed to the supply side.",
  },
  SupplySideRevenue: {
    "Trading Fee Refund": "Trading fees distributed as refunds",
    "Maker Rebate": "Maker rebates distributed to makers",
    "Referral Fee": "Referral fees distributed to referrers",
  }
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.BSC],
  start: "2024-12-10",
  fetch,
  methodology,
  breakdownMethodology,
};

export default adapter;
