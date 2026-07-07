import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";
import { METRIC } from "../../helpers/metrics";

const VAULT = "0x8B0665a66d4E046dd5E77a42856F8180F9bb19ef";

const ABI = {
  minted: "event Minted(address indexed minter, address indexed recipient, address indexed token, uint256 tokenAmountIn, uint256 elUSDAmountOut, uint256 fee)",
  redeemSettled: "event RedeemSettled(uint256 indexed redemptionId, address indexed redeemer, address indexed recipient, address token, uint256 elUSDAmountIn, uint256 tokenAmountOut, uint256 fee)",
};

const REVENUE_LABEL = "Mint/Redeem Fees To Treasury";
const COLLATERAL_TOKENS = new Set([
  ADDRESSES.ethereum.USDC.toLowerCase(),
  ADDRESSES.ethereum.USDT.toLowerCase(),
  ADDRESSES.ethereum.USDe.toLowerCase(),
]);

const addFee = (
  options: FetchOptions,
  balances: ReturnType<FetchOptions["createBalances"]>,
  log: { token: string; fee: string | bigint | number },
  label: string,
) => {
  const token = log.token.toLowerCase();
  if (!COLLATERAL_TOKENS.has(token)) throw new Error(`Unsupported Elara fee token: ${log.token}`);
  balances.add(log.token, log.fee, label);
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyUserFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  const [mintLogs, redeemSettledLogs] = await Promise.all([
    options.getLogs({ target: VAULT, eventAbi: ABI.minted }),
    options.getLogs({ target: VAULT, eventAbi: ABI.redeemSettled }),
  ]);

  mintLogs.concat(redeemSettledLogs).forEach((log) => {
    addFee(options, dailyFees, log, METRIC.MINT_REDEEM_FEES);
    addFee(options, dailyUserFees, log, METRIC.MINT_REDEEM_FEES);
    addFee(options, dailyRevenue, log, REVENUE_LABEL);
    addFee(options, dailyProtocolRevenue, log, REVENUE_LABEL);
  });

  return {
    dailyFees,
    dailyUserFees,
    dailyRevenue,
    dailyProtocolRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.ETHEREUM],
  start: "2026-06-16",
  fetch,
  methodology: {
    Fees: "Fees paid by users when minting elUSD with supported collateral or redeeming elUSD for collateral.",
    UserFees: "Mint and redeem fees paid by users.",
    Revenue: "All mint and settled redeem fees are kept by the protocol treasury.",
    ProtocolRevenue: "All mint and settled redeem fees are allocated to the protocol treasury.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.MINT_REDEEM_FEES]: "Fees charged when users mint elUSD or settle elUSD redemptions.",
    },
    UserFees: {
      [METRIC.MINT_REDEEM_FEES]: "Fees paid directly by users when minting or redeeming elUSD.",
    },
    Revenue: {
      [REVENUE_LABEL]: "Mint and settled redeem fees collected by the Elara treasury.",
    },
    ProtocolRevenue: {
      [REVENUE_LABEL]: "Mint and settled redeem fees allocated to the Elara treasury.",
    },
  },
};

export default adapter;
