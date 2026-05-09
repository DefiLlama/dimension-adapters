// https://etherfi.gitbook.io/etherfi/liquid/technical-documentation#fees
import { Adapter, FetchOptions, FetchV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { ethers } from "ethers";
import ADDRESSES from "../../helpers/coreAssets.json";
import { METRIC } from "../../helpers/metrics";

const EETH = ADDRESSES.ethereum.EETH;
const TREASURY = "0x2f5301a3D59388c509C65f8698f521377D41Fd0F";
const WITHDRAWAL_ROUTER = "0x7d5706f6ef3F89B3951E23e557CDFBC3239D4E2c";

const BPS_DENOMINATOR = 10_000;
const DAYS_PER_YEAR = 365;

const ACCOUNTANT_STATE_V1_ABI =
  "function accountantState() view returns (address payoutAddress, uint96 highwaterMark, uint128 feesOwedInBase, uint128 totalSharesLastUpdate, uint96 exchangeRate, uint16 allowedExchangeRateChangeUpper, uint16 allowedExchangeRateChangeLower, uint64 lastUpdateTimestamp, bool isPaused, uint24 minimumUpdateDelayInSeconds, uint16 platformFee, uint16)";
const ACCOUNTANT_STATE_V2_ABI =
  "function accountantState() view returns (address payoutAddress, uint128 feesOwedInBase, uint128 totalSharesLastUpdate, uint96 exchangeRate, uint16 allowedExchangeRateChangeUpper, uint16 allowedExchangeRateChangeLower, uint64 lastUpdateTimestamp, bool isPaused, uint32 minimumUpdateDelayInSeconds, uint16 managementFee)";

const TOTAL_SUPPLY_ABI = "function totalSupply() view returns (uint256)";
const BASE_ABI = "function base() view returns (address)";
const GET_RATE_ABI = "function getRate() view returns (uint256)";
const DECIMALS_ABI = "function decimals() view returns (uint8)";
const TRANSFER_EVENT_ABI =
  "event Transfer(address indexed from, address indexed to, uint256 value)";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

type LiquidVault = {
  name: string;
  vault: string;
  accountant: string;
  version: "v1" | "v2";
};

const LIQUID_VAULTS: LiquidVault[] = [
  {
    name: "ETH",
    vault: "0xf0bb20865277aBd641a307eCe5Ee04E79073416C",
    accountant: "0x0d05D94a5F1E76C18fbeB7A13d17C8a314088198",
    version: "v2",
  },
  {
    name: "USD",
    vault: "0x08c6F91e2B681FaF5e17227F2a44C307b3C1364C",
    accountant: "0xc315D6e14DDCDC7407784e2Caf815d131Bc1D3E7",
    version: "v2",
  },
  {
    name: "UsualStable",
    vault: "0xeDa663610638E6557c27e2f4e973D3393e844E70",
    accountant: "0x1D4F0F05e50312d3E7B65659Ef7d06aa74651e0C",
    version: "v1",
  },
  {
    name: "UltraUSD",
    vault: "0xbc0f3B23930fff9f4894914bD745ABAbA9588265",
    accountant: "0x95fE19b324bE69250138FE8EE50356e9f6d17Cfe",
    version: "v1",
  },
  {
    name: "BTC",
    vault: "0x5f46d540b6eD704C3c8789105F30E075AA900726",
    accountant: "0xEa23aC6D7D11f6b181d6B98174D334478ADAe6b0",
    version: "v1",
  },
];

const LABELS = {
  WITHDRAW_FEES: "Vault Withdraw Fees",
  MANAGEMENT_FEES: METRIC.MANAGEMENT_FEES,
};

const totalSupply = (options: FetchOptions, target: string) =>
  options.api.call({ target, abi: TOTAL_SUPPLY_ABI });

const payoutDetails = (options: FetchOptions, target: string) =>
  Promise.all([
    options.api.call({ target, abi: BASE_ABI }),
    options.api.call({ target, abi: GET_RATE_ABI }),
  ]);

const sumWithdrawalFees = async (options: FetchOptions) => {
  const logs = await options.getLogs({
    target: EETH,
    eventAbi: TRANSFER_EVENT_ABI,
    topics: [
      TRANSFER_TOPIC,
      ethers.zeroPadValue(WITHDRAWAL_ROUTER, 32),
      ethers.zeroPadValue(TREASURY, 32),
    ],
  });
  const withdrawal_fees = logs.reduce((acc, log) => acc + Number(log.value), 0);
  return BigInt(withdrawal_fees);
};

/**
 * EtherFi Revenue Stream Categories:
 *
 * DEPOSIT_WITHDRAW_FEES: Withdrawal fees from vault operations (protocol only)
 *
 * Note: Different revenue streams have different protocol vs supply side splits
 */
const fetch: FetchV2 = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  for (const vault of LIQUID_VAULTS) {
    const abi = vault.version === "v1" ? ACCOUNTANT_STATE_V1_ABI : ACCOUNTANT_STATE_V2_ABI;

    const state = await options.fromApi.call({
      target: vault.accountant,
      abi,
      permitFailure: true,
    });

    if (state) {
      const feeBps = vault.version === "v1" ? state.platformFee : state.managementFee;
      const feeFraction = feeBps / BPS_DENOMINATOR;
      const supply = await totalSupply(options, vault.vault);
      const [base, rate] = await payoutDetails(options, vault.accountant);
      const baseDecimals = await options.api.call({ target: base, abi: DECIMALS_ABI });
      const dailyFee = ((supply * rate) / 10 ** baseDecimals) * (feeFraction / DAYS_PER_YEAR);

      dailyFees.add(base, dailyFee, LABELS.MANAGEMENT_FEES);
      dailyRevenue.add(base, dailyFee, LABELS.MANAGEMENT_FEES);
    }
  }

  const withdrawals = await sumWithdrawalFees(options);
  dailyFees.add(EETH, withdrawals, LABELS.WITHDRAW_FEES);
  dailyRevenue.add(EETH, withdrawals, LABELS.WITHDRAW_FEES);

  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue };
};

const adapter: Adapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: "2024-07-15",
  methodology: {
    Fees: "Management fees and withdrawal fees from ether.fi Liquid BoringVaults.",
    Revenue: "100% of fees retained by ether.fi protocol treasury.",
    ProtocolRevenue: "Same as Revenue.",
  },
  breakdownMethodology: {
    Fees: {
      [LABELS.MANAGEMENT_FEES]: "Daily accrual = TVL x platformFee_bps / 10000 / 365 per vault.",
      [LABELS.WITHDRAW_FEES]:
        "Withdrawal fees from Liquid vault operations (eETH transfers from etherfi-withdrawal-router to treasury).",
    },
  },
};

export default adapter;
