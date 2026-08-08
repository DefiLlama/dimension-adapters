// https://etherfi.gitbook.io/etherfi/liquid/technical-documentation#fees
import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from '../../helpers/coreAssets.json';
import { METRIC } from "../../helpers/metrics";

const STETH = ADDRESSES.ethereum.STETH;
const YEAR = 365;

const accountStateV1Abi = 'function accountantState() view returns (address payoutAddress, uint96 highwaterMark, uint128 feesOwedInBase, uint128 totalSharesLastUpdate, uint96 exchangeRate, uint16 allowedExchangeRateChangeUpper, uint16 allowedExchangeRateChangeLower, uint64 lastUpdateTimestamp, bool isPaused, uint24 minimumUpdateDelayInSeconds, uint16 platformFee, uint16)';
const accountStateV2Abi = 'function accountantState() view returns (address payoutAddress, uint128 feesOwedInBase, uint128 totalSharesLastUpdate, uint96 exchangeRate, uint16 allowedExchangeRateChangeUpper, uint16 allowedExchangeRateChangeLower, uint64 lastUpdateTimestamp, bool isPaused, uint32 minimumUpdateDelayInSeconds, uint16 managementFee)';

const LIQUID_VAULTS = {
  ETHVault: {
    name: "ETH Vault",
    target: "0xf0bb20865277aBd641a307eCe5Ee04E79073416C",
    accountant: "0x0d05D94a5F1E76C18fbeB7A13d17C8a314088198",
    version: 'v2'
  },
  USDVault: {
    name: "USD Vault",
    target: "0x08c6F91e2B681FaF5e17227F2a44C307b3C1364C",
    accountant: "0xc315D6e14DDCDC7407784e2Caf815d131Bc1D3E7",
    version: 'v2'
  },
  UsualStableVault: {
    name: "Usual Stable Vault",
    target: "0xeDa663610638E6557c27e2f4e973D3393e844E70",
    accountant: "0x1D4F0F05e50312d3E7B65659Ef7d06aa74651e0C",
    version: 'v1',
  },
  UltraUSDVault: {
    name: "BTC Vault",
    target: '0xbc0f3B23930fff9f4894914bD745ABAbA9588265',
    accountant: '0x95fE19b324bE69250138FE8EE50356e9f6d17Cfe',
    version: 'v1',
  },
  BTCVault: {
    name: "BTC Vault",
    target: '0x5f46d540b6eD704C3c8789105F30E075AA900726',
    accountant: '0xEa23aC6D7D11f6b181d6B98174D334478ADAe6b0',
    version: 'v1'
  },
}

const MetricLabels = {
  MANAGEMENT_FEES: METRIC.MANAGEMENT_FEES,
  stETH_STAKING_REWARDS: 'Liquid Vaults stETH Staking Rewards',
}

const getTotalSupply = async (options: FetchOptions, target: string) => {
  return await options.api.call({
    target: target,
    abi: "function totalSupply() external view returns (uint256)",
  });
};

const getStethFees = async (options: FetchOptions, totalSteth: number) => {
  const stethRebaseLogs = await options.getLogs({
    target: STETH,
    eventAbi: "event TokenRebased(uint256 indexed reportTimestamp,uint256 timeElapsed,uint256 preTotalShares,uint256 preTotalEther,uint256 postTotalShares,uint256 postTotalEther,uint256 sharesMintedAsFees)",
  });
  if (stethRebaseLogs.length === 0) return 0;
  const lastRebaseLog = stethRebaseLogs[stethRebaseLogs.length - 1];
  const exchangeRateBefore = Number(lastRebaseLog.preTotalEther) / Number(lastRebaseLog.preTotalShares);
  const exchangeRateAfter = Number(lastRebaseLog.postTotalEther) / Number(lastRebaseLog.postTotalShares);
  const stethShares = totalSteth / exchangeRateBefore
  const changeInSteth = (stethShares * exchangeRateAfter) - (stethShares * exchangeRateBefore);
  return changeInSteth;
};

const getTotalSteth = async (options: FetchOptions) => {
  //steth or steth derivative holding
  const WSTETH = ADDRESSES.ethereum.WSTETH
  const STETH = ADDRESSES.ethereum.STETH
  const KARAK_WSTETH = "0xa3726beDFD1a8AA696b9B4581277240028c4314b"
  const SYMBIOTIC_WSTETH = "0xC329400492c6ff2438472D4651Ad17389fCb843a"
  const WEETHS = "0x917ceE801a67f933F2e6b33fC0cD1ED2d5909D88"
  const WEETHK = "0x7223442cad8e9cA474fC40109ab981608F8c4273"
  const WEETHK_HOLDER = "0xFdc479a18d06e2721d17024b549f3f6173a68805"
  const GWEI = 1000000000
  const wstethExchangeRate = (await options.api.call({
    target: WSTETH,
    abi: "function getStETHByWstETH(uint256 _wstETHAmount) external view returns (uint256)",
    params: [1000000000],
  }));

  const STETH_HOLDERS = [WEETHS, WEETHK]
  var totalSteth = BigInt(0);
  for (const holder of STETH_HOLDERS) {
    const stethHolding = await options.api.call({
      target: STETH,
      abi: "function balanceOf(address account) external view returns (uint256)",
      params: [holder],
    });
    let wstethHolding = await options.api.call({
      target: WSTETH,
      abi: "function balanceOf(address account) external view returns (uint256)",
      params: [holder],
    });

    totalSteth = BigInt(totalSteth) + BigInt(stethHolding) + BigInt(wstethHolding) * BigInt(wstethExchangeRate) / BigInt(GWEI);
  }

  let restakedWstethSymbiotic = await options.api.call({
    target: SYMBIOTIC_WSTETH,
    abi: "function balanceOf(address account) external view returns (uint256)",
    params: [WEETHS],
    permitFailure: true,
  });
  let restakedWstethKarak = await options.api.call({
    target: KARAK_WSTETH,
    abi: "function balanceOf(address account) external view returns (uint256)",
    params: [WEETHK_HOLDER],
    permitFailure: true,
  });

  restakedWstethSymbiotic = restakedWstethSymbiotic || 0
  restakedWstethKarak = restakedWstethKarak || 0

  totalSteth = totalSteth + BigInt(restakedWstethSymbiotic * wstethExchangeRate / GWEI + restakedWstethKarak * wstethExchangeRate / GWEI);
  return Number(totalSteth);
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

/**
 * EtherFi Liquid Revenue Stream Categories:
 *
 * LIQUID_VAULT_FEES: Management fees from vault products (protocol only)
 * stETH_STAKING_REWARDS: Lido stETH rebasing rewards on vault holdings
 *   (2.5% to protocol, rest to vault depositors)
 *
 * Note: Different revenue streams have different protocol vs supply side splits
 */
const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const totalSteth = await getTotalSteth(options);
  const stethFees = await getStethFees(options, totalSteth);
  const stethRevenue = totalSteth * 3.5 / 100 * 0.025 / 365

  // liquid earnings
  for (const vault of Object.values(LIQUID_VAULTS)) {
    let accountStateAbi = ''
    if (vault.version == 'v1') {
      accountStateAbi = accountStateV1Abi
    } else {
      accountStateAbi = accountStateV2Abi
    }
    const vaultState = await options.fromApi.call({
      abi: accountStateAbi,
      target: vault.accountant,
      permitFailure: true
    });

    if (vaultState) {
      // v1 accountants expose the bps as `platformFee`; v2 as `managementFee`.
      const feeBps = vault.version === 'v1' ? vaultState.platformFee : vaultState.managementFee;
      const totalSupply_vault = await getTotalSupply(options, vault.target);
      const [asset_vault, rate_vault] = await getPayoutDetails(options, vault.accountant);
      const vaultDecimals = await options.api.call({
        target: vault.target,
        abi: 'function decimals() view returns (uint8)',
      });
      // Keep math in bigint: 18-dec vault TVLs (~1e22) overflow Number precision.
      const tvlBaseRaw = (BigInt(totalSupply_vault) * BigInt(rate_vault)) / (10n ** BigInt(vaultDecimals));
      const dailyFeeRaw = (tvlBaseRaw * BigInt(feeBps)) / 10000n / BigInt(YEAR);

      dailyFees.add(asset_vault, dailyFeeRaw, MetricLabels.MANAGEMENT_FEES);
      dailyRevenue.add(asset_vault, dailyFeeRaw, MetricLabels.MANAGEMENT_FEES);
    }
  }

  // stETH holding rewards from Lido rebasing (protocol keeps revenue portion, vault depositors get fees)
  dailyFees.add(STETH, stethFees + stethRevenue, MetricLabels.stETH_STAKING_REWARDS);
  dailyRevenue.add(STETH, stethRevenue, MetricLabels.stETH_STAKING_REWARDS); // Protocol share (2.5%)
  dailySupplySideRevenue.add(STETH, stethFees, MetricLabels.stETH_STAKING_REWARDS); // Depositor share (rebasing rewards)

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: Adapter = {
  version: 1,
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: '2024-03-13',
  methodology: {
    Fees: "Total rewards generated from ether.fi liquid vaults: management fees and staking rewards on vault holdings",
    Revenue: "Protocol's share of fees including liquid vault management fees",
    ProtocolRevenue: "Same as Revenue - all protocol earnings retained by ether.fi.",
    SupplySideRevenue: "Portion of fees distributed to vault depositors.",
  },
  breakdownMethodology: {
    Fees: {
      [MetricLabels.MANAGEMENT_FEES]: 'Annualized management fees charged on the TVL of the liquid vaults, prorated daily.',
      [MetricLabels.stETH_STAKING_REWARDS]: 'Lido rebasing rewards accrued on the stETH/wstETH held by the weETHs and weETHk vaults, including their restaked wstETH positions.',
    },
    Revenue: {
      [MetricLabels.MANAGEMENT_FEES]: 'All liquid vault management fees are retained by the protocol.',
      [MetricLabels.stETH_STAKING_REWARDS]: 'Protocol keeps a 2.5% share of the stETH staking rewards on vault holdings.',
    },
    SupplySideRevenue: {
      [MetricLabels.stETH_STAKING_REWARDS]: 'stETH rebasing rewards passed on to vault depositors (everything above the 2.5% protocol share).',
    },
  }
};

export default adapter;
