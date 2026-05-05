import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const USDAT = "0x23238f20b894f29041f48D88eE91131C395Aaa71";
const sUSDat = "0xD166337499E176bbC38a1FBd113Ab144e5bd2Df7";
const STRC_ORACLE = "0x5f7eCD0D045c393da6cb6c933c671AC305A871BF";
const BPS = 10000n;
const PERFORMANCE_FEE_BPS = 1000n;

// Sources:
// - USDat / sUSDat docs: https://saturncredit.gitbook.io/saturn-docs/solution
// - Fee and reserve docs: https://saturncredit.gitbook.io/saturn-docs/operations-and-governance/protocol-fee-and-risk-reserve
// - Verified contracts: https://etherscan.io/address/0xD166337499E176bbC38a1FBd113Ab144e5bd2Df7#code
// - M0 JMI yield model: https://docs.m0.org/build/models/treasury/jmi/overview/
const Event = {
  Deposit: "event Deposit(address indexed sender,address indexed owner,uint256 assets,uint256 shares)",
  RewardsReceived: "event RewardsReceived(uint256 strcAmount,uint256 amount)",
  YieldClaimed: "event YieldClaimed(uint256 amount)",
};
const ABI = {
  depositFeeBps: "uint256:depositFeeBps",
  getPrice: "function getPrice() view returns (uint256 price, uint8 priceDecimals)",
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyUserFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const depositLogs = await options.getLogs({ target: sUSDat, eventAbi: Event.Deposit });
  const rewardLogs = await options.getLogs({ target: sUSDat, eventAbi: Event.RewardsReceived });
  const usdatYieldLogs = await options.getLogs({ target: USDAT, eventAbi: Event.YieldClaimed });

  if (depositLogs.length) {
    const feeBpsRaw = await options.api.call({ target: sUSDat, abi: ABI.depositFeeBps });
    const feeBps = BigInt(feeBpsRaw);
    if (feeBps) {
      depositLogs.forEach((log: any) => {
        // Deposit.assets is net of fees, so gross up the net amount to recover the deposit fee.
        const denominator = BPS - feeBps;
        const fee = (BigInt(log.assets) * feeBps + denominator - 1n) / denominator;
        dailyFees.add(USDAT, fee, METRIC.DEPOSIT_WITHDRAW_FEES);
        dailyUserFees.add(USDAT, fee, METRIC.DEPOSIT_WITHDRAW_FEES);
        dailyRevenue.add(USDAT, fee, METRIC.DEPOSIT_WITHDRAW_FEES);
        dailyProtocolRevenue.add(USDAT, fee, METRIC.DEPOSIT_WITHDRAW_FEES);
      });
    }
  }

  const price = await options.api.call({ target: STRC_ORACLE, abi: ABI.getPrice });
  const strcPrice = BigInt((price as any).price ?? (price as any)[0]);
  const priceDecimals = BigInt((price as any).priceDecimals ?? (price as any)[1]);
  rewardLogs.forEach((log: any) => {
    // RewardsReceived is the amount received by sUSDat holders; gross up to include Saturn's 10% fee.
    const amount = BigInt(log.strcAmount) * strcPrice / 10n ** priceDecimals;
    const protocolFee = amount * PERFORMANCE_FEE_BPS / (BPS - PERFORMANCE_FEE_BPS);
    dailyFees.add(USDAT, amount + protocolFee, METRIC.ASSETS_YIELDS);
    dailyRevenue.add(USDAT, protocolFee, METRIC.PERFORMANCE_FEES);
    dailyProtocolRevenue.add(USDAT, protocolFee, METRIC.PERFORMANCE_FEES);
    dailySupplySideRevenue.add(USDAT, amount, METRIC.ASSETS_YIELDS);
  });

  usdatYieldLogs.forEach((log: any) => {
    // USDat reserve yield is minted to Saturn's yield recipient by the M0 JMI YieldToOne model.
    dailyFees.add(USDAT, log.amount, METRIC.ASSETS_YIELDS);
    dailyRevenue.add(USDAT, log.amount, METRIC.ASSETS_YIELDS);
    dailyProtocolRevenue.add(USDAT, log.amount, METRIC.ASSETS_YIELDS);
  });

  return { dailyFees, dailyUserFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue };
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.ETHEREUM],
  start: "2026-03-10",
  fetch,
  methodology: {
    Fees: "Fees include any sUSDat deposit fees, rewards added to the sUSDat vault, and USDat reserve yield claimed by Saturn.",
    UserFees: "Users may pay a fee when depositing USDat into sUSDat.",
    Revenue: "Saturn earns sUSDat deposit fees, USDat reserve yield, and 10% of sUSDat STRC rewards.",
    ProtocolRevenue: "Saturn earns sUSDat deposit fees, USDat reserve yield, and 10% of sUSDat STRC rewards.",
    SupplySideRevenue: "sUSDat holders earn the STRC rewards received by the vault as the value of each sUSDat share increases.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.DEPOSIT_WITHDRAW_FEES]: "Fees paid when users deposit USDat into sUSDat.",
      [METRIC.ASSETS_YIELDS]: "Yield from STRC rewards added to sUSDat and from USDat reserves claimed by Saturn.",
    },
    Revenue: {
      [METRIC.DEPOSIT_WITHDRAW_FEES]: "Deposit fees kept by Saturn.",
      [METRIC.ASSETS_YIELDS]: "USDat reserve yield claimed by Saturn.",
      [METRIC.PERFORMANCE_FEES]: "Saturn's 10% fee on gross sUSDat STRC rewards.",
    },
    ProtocolRevenue: {
      [METRIC.DEPOSIT_WITHDRAW_FEES]: "Deposit fees kept by Saturn.",
      [METRIC.ASSETS_YIELDS]: "USDat reserve yield claimed by Saturn.",
      [METRIC.PERFORMANCE_FEES]: "Saturn's 10% fee on gross sUSDat STRC rewards.",
    },
    SupplySideRevenue: {
      [METRIC.ASSETS_YIELDS]: "STRC rewards received by the vault and earned by sUSDat holders through a higher vault share price.",
    },
  },
};

export default adapter;
