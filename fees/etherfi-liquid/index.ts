// https://etherfi.gitbook.io/etherfi/liquid/technical-documentation#fees
import { Adapter, FetchOptions, FetchV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { ethers } from "ethers";
import ADDRESSES from "../../helpers/coreAssets.json";
import { METRIC } from "../../helpers/metrics";

const EETH = ADDRESSES.ethereum.EETH;
const EIGEN = ADDRESSES.ethereum.EIGEN;
const LIQUIDITY_POOL = "0x308861A430be4cce5502d0A12724771Fc6DaF216";
const STETH = ADDRESSES.ethereum.STETH;
const SSV = "0x9D65fF81a3c488d585bBfb0Bfe3c7707c7917f54";
const OBOL = "0x0B010000b7624eb9B3DfBC279673C76E9D29D5F7";
const YEAR = 365;

const accountStateV1Abi =
  "function accountantState() view returns (address payoutAddress, uint96 highwaterMark, uint128 feesOwedInBase, uint128 totalSharesLastUpdate, uint96 exchangeRate, uint16 allowedExchangeRateChangeUpper, uint16 allowedExchangeRateChangeLower, uint64 lastUpdateTimestamp, bool isPaused, uint24 minimumUpdateDelayInSeconds, uint16 platformFee, uint16)";
const accountStateV2Abi =
  "function accountantState() view returns (address payoutAddress, uint128 feesOwedInBase, uint128 totalSharesLastUpdate, uint96 exchangeRate, uint16 allowedExchangeRateChangeUpper, uint16 allowedExchangeRateChangeLower, uint64 lastUpdateTimestamp, bool isPaused, uint32 minimumUpdateDelayInSeconds, uint16 managementFee)";

const LIQUID_VAULTS = {
  ETHVault: {
    name: "ETH Vault",
    target: "0xf0bb20865277aBd641a307eCe5Ee04E79073416C",
    accountant: "0x0d05D94a5F1E76C18fbeB7A13d17C8a314088198",
    version: "v2",
  },
  USDVault: {
    name: "USD Vault",
    target: "0x08c6F91e2B681FaF5e17227F2a44C307b3C1364C",
    accountant: "0xc315D6e14DDCDC7407784e2Caf815d131Bc1D3E7",
    version: "v2",
  },
  UsualStableVault: {
    name: "Usual Stable Vault",
    target: "0xeDa663610638E6557c27e2f4e973D3393e844E70",
    accountant: "0x1D4F0F05e50312d3E7B65659Ef7d06aa74651e0C",
    version: "v1",
  },
  UltraUSDVault: {
    name: "UltraYield Stable Vault",
    target: "0xbc0f3B23930fff9f4894914bD745ABAbA9588265",
    accountant: "0x95fE19b324bE69250138FE8EE50356e9f6d17Cfe",
    version: "v1",
  },
  BTCVault: {
    name: "BTC Vault",
    target: "0x5f46d540b6eD704C3c8789105F30E075AA900726",
    accountant: "0xEa23aC6D7D11f6b181d6B98174D334478ADAe6b0",
    version: "v1",
  },
};

const LABELS = {
  WITHDRAW_FEES: "Vault Withdraw Fees",
  MANAGEMENT_FEES: METRIC.MANAGEMENT_FEES,
};

const getTotalSupply = async (options: FetchOptions, target: string) => {
  return await options.api.call({
    target,
    abi: "function totalSupply() external view returns (uint256)",
  });
};

const getPayoutDetails = async (options: FetchOptions, target: string) => {
  const [asset_eth, rate_eth] = await Promise.all([
    options.api.call({
      target: target,
      abi: "function base() external view returns (address)",
    }),
    options.api.call({
      target: target,
      abi: "function getRate() external view returns (uint256 rate)",
    }),
  ]);
  return [asset_eth, rate_eth];
};

const getWithdrawalFees = async (options: FetchOptions) => {
  const logs = await options.getLogs({
    target: EETH,
    eventAbi: "event Transfer(address indexed from, address indexed to, uint256 value)",
    topics: [
      "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
      ethers.zeroPadValue("0x7d5706f6ef3F89B3951E23e557CDFBC3239D4E2c", 32),
      ethers.zeroPadValue("0x2f5301a3D59388c509C65f8698f521377D41Fd0F", 32),
    ],
  });
  const withdrawal_fees = logs.reduce((acc, log) => acc + Number(log.value), 0);
  return BigInt(withdrawal_fees);
};

const fetch: FetchV2 = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  // Liquid vault management fees
  for (const vault of Object.values(LIQUID_VAULTS)) {
    const accountStateAbi = vault.version === "v1" ? accountStateV1Abi : accountStateV2Abi;
    const vaultState = await options.fromApi.call({
      abi: accountStateAbi,
      target: vault.accountant,
      permitFailure: true,
    });

    if (vaultState) {
      const vaultFees = vaultState.managementFee / (100 * 100); // bps -> fraction

      const totalSupply_vault = await getTotalSupply(options, vault.target);
      const [asset_vault, rate_vault] = await getPayoutDetails(options, vault.accountant);

      const dailyFee = ((totalSupply_vault * rate_vault) / 1e18) * (vaultFees / YEAR);
      dailyFees.add(asset_vault, dailyFee, LABELS.MANAGEMENT_FEES);
      dailyRevenue.add(asset_vault, dailyFee, LABELS.MANAGEMENT_FEES);
    }
  }

  // Liquid vault withdrawal fees
  const withdrawalFees = await getWithdrawalFees(options);
  dailyFees.add(EETH, withdrawalFees, LABELS.WITHDRAW_FEES);
  dailyRevenue.add(EETH, withdrawalFees, LABELS.WITHDRAW_FEES);

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
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
