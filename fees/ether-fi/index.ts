// https://etherfi.gitbook.io/etherfi/liquid/technical-documentation#fees
import * as sdk from "@defillama/sdk";
import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { ethers } from "ethers";
import ADDRESSES from '../../helpers/coreAssets.json';

const EETH = ADDRESSES.ethereum.EETH;
const EIGEN = ADDRESSES.ethereum.EIGEN;
const LIQUIDITY_POOL = "0x308861A430be4cce5502d0A12724771Fc6DaF216";
const STETH = ADDRESSES.ethereum.STETH;
const SSV = "0x9D65fF81a3c488d585bBfb0Bfe3c7707c7917f54";
const OBOL = "0x0B010000b7624eb9B3DfBC279673C76E9D29D5F7";
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

const getTotalSupply = async (options, target) => {
  return await options.api.call({
    target: target,
    abi: "function totalSupply() external view returns (uint256)",
  });
};

const getStethFees = async (options, totalSteth) => {
  const stethRebaseLogs = await options.getLogs({
    target: STETH,
    eventAbi: "event TokenRebased(uint256 indexed reportTimestamp,uint256 timeElapsed,uint256 preTotalShares,uint256 preTotalEther,uint256 postTotalShares,uint256 postTotalEther,uint256 sharesMintedAsFees)",
  });
  const lastRebaseLog = stethRebaseLogs[0]
  const exchangeRateBefore = Number(lastRebaseLog.preTotalEther) / Number(lastRebaseLog.preTotalShares);
  const exchangeRateAfter = Number(lastRebaseLog.postTotalEther) / Number(lastRebaseLog.postTotalShares);
  const stethShares = totalSteth / exchangeRateBefore
  const changeInSteth = (stethShares * exchangeRateAfter) - (stethShares * exchangeRateBefore);
  return changeInSteth;
};

const getTotalSteth = async (options) => {
  //steth or steth derivative holding
  const WSTETH = ADDRESSES.ethereum.WSTETH
  const STETH = ADDRESSES.ethereum.STETH
  const KARAK_WSTETH = "0xa3726beDFD1a8AA696b9B4581277240028c4314b"
  const SYMBIOTIC_WSTETH = "0xC329400492c6ff2438472D4651Ad17389fCb843a"
  const DEVAMP = "0x9FFDF407cDe9a93c47611799DA23924Af3EF764F"
  const WEETHS = "0x917ceE801a67f933F2e6b33fC0cD1ED2d5909D88"
  const WEETHK = "0x7223442cad8e9cA474fC40109ab981608F8c4273"
  const WEETHK_HOLDER = "0xFdc479a18d06e2721d17024b549f3f6173a68805"
  const GWEI = 1000000000
  const wstethExchangeRate = (await options.api.call({
    target: WSTETH,
    abi: "function getStETHByWstETH(uint256 _wstETHAmount) external view returns (uint256)",
    params: [1000000000],
  }));

  const STETH_HOLDERS = [DEVAMP, WEETHS, WEETHK]
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
  });
  let restakedWstethKarak = await options.api.call({
    target: KARAK_WSTETH,
    abi: "function balanceOf(address account) external view returns (uint256)",
    params: [WEETHK_HOLDER],
  });

  totalSteth = totalSteth + BigInt(restakedWstethSymbiotic * wstethExchangeRate / GWEI + restakedWstethKarak * wstethExchangeRate / GWEI);
  return Number(totalSteth);
};

const getPayoutDetails = async (options, target) => {
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

const getSsvRevenue = async (options: FetchOptions) => {
  const logs = await options.getLogs({
    target: SSV,
    eventAbi: "event Transfer(address indexed from, address indexed to, uint256 value)",
    topics: ["0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef", null as any, ethers.zeroPadValue("0xd1208cC82765aA4dc696117D26f37388B6Dcb6D5", 32)],
  })
  let ssv_revenue = 0;
  for (const log of logs) {
    if (log.from.toLowerCase() === "0x8fb66F38cF86A3d5e8768f8F1754A24A6c661Fb8".toLowerCase()) {
      ssv_revenue += +Number(log.value);
    }
    else {
      ssv_revenue += +Number(log.value) * 0.8;
    }
  }
  return BigInt(ssv_revenue);
}

const getObolRevenue = async (options: FetchOptions) => {
  const logs = await options.getLogs({
    target: OBOL,
    eventAbi: "event Transfer(address indexed from, address indexed to, uint256 value)",
    topics: ["0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef", null as any, ethers.zeroPadValue("0x0c83EAe1FE72c390A02E426572854931EefF93BA", 32)],
  })
  const obol_revenue = logs.reduce((acc, log) => acc + Number(log.value), 0);
  return BigInt(obol_revenue);
}

const getWithdrawalFees = async (options: FetchOptions) => {
  const logs = await options.getLogs({
    target: EETH,
    eventAbi: "event Transfer(address indexed from, address indexed to, uint256 value)",
    topics: ["0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef", ethers.zeroPadValue("0x7d5706f6ef3F89B3951E23e557CDFBC3239D4E2c", 32), ethers.zeroPadValue("0x2f5301a3D59388c509C65f8698f521377D41Fd0F", 32)],
  })
  const withdrawal_fees = logs.reduce((acc, log) => acc + Number(log.value), 0);
  return BigInt(withdrawal_fees);
}

const getMiscStakingRevenue = async (options: FetchOptions) => {
  const logs = await options.getLogs({
    target: "0x35fA164735182de50811E8e2E824cFb9B6118ac2", //eETH as WETH
    eventAbi: "event Transfer(address indexed from, address indexed to, uint256 value)",
    topics: ["0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef", null as any, ethers.zeroPadValue("0x0c83EAe1FE72c390A02E426572854931EefF93BA", 32)],
  });
  const logs2 = await options.getLogs({
    target: EIGEN,
    eventAbi: "event Transfer(address indexed from, address indexed to, uint256 value)",
    topics: ["0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef", null as any, ethers.zeroPadValue("0x0c83EAe1FE72c390A02E426572854931EefF93BA", 32)],
  });

  const wethRevenue = logs.reduce((acc, log) => acc + Number(log.value), 0);
  const eigenRevenue = logs2.reduce((acc, log) => acc + Number(log.value), 0);
  return {
    wethRevenue: BigInt(wethRevenue),
    eigenRevenue: BigInt(eigenRevenue),
  };
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRev = options.createBalances();

  const totalSteth = await getTotalSteth(options);

  // get total staking fees earned
  let totalStakeFees = BigInt(0);
  const protocolFeesLog = await options.getLogs({
    target: LIQUIDITY_POOL,
    eventAbi: "event ProtocolFeePaid(uint128 protocolFees)",
  });

  for (const log of protocolFeesLog) {
    totalStakeFees += log.protocolFees;
  }
  const stethFees = await getStethFees(options, totalSteth);
  const stethRevenue = totalSteth * 3.5 / 100 * 0.025 / 365

  // add restaking fees claimed weekly
  const optimismApi = new sdk.ChainApi({ chain: 'optimism' });
  const restakingRewardsEigen = BigInt(await optimismApi.call({
    target: '0xAB7590CeE3Ef1A863E9A5877fBB82D9bE11504da',
    abi: 'function categoryTVL(string _category) view returns (uint256)',
    params: [EIGEN]
  }));
  dailyFees.add(EIGEN, restakingRewardsEigen / BigInt(7));
  dailyRev.add(EIGEN, restakingRewardsEigen / BigInt(7 * 90) * BigInt(10));

  // add ssv revenue for running ssv validators
  const ssvRevenue = await getSsvRevenue(options);
  dailyFees.add(SSV, ssvRevenue);
  dailyRev.add(SSV, ssvRevenue);

  // add obol revenue for running obol validators
  const obolRevenue = await getObolRevenue(options);
  dailyFees.add(OBOL, obolRevenue);
  dailyRev.add(OBOL, obolRevenue);

  // add withdrawal fees
  const withdrawalFees = await getWithdrawalFees(options);
  dailyFees.add(EETH, withdrawalFees);
  dailyRev.add(EETH, withdrawalFees);

  const { wethRevenue, eigenRevenue } = await getMiscStakingRevenue(options);
  dailyRev.add(EETH, wethRevenue);
  dailyFees.add(EETH, wethRevenue);
  dailyRev.add(EIGEN, eigenRevenue);
  dailyFees.add(EIGEN, eigenRevenue);

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
    });
    const vaultFees = vaultState.managementFee / 100;

    const totalSupply_vault = await getTotalSupply(options, vault.target);
    const [asset_vault, rate_vault] = await getPayoutDetails(options, vault.accountant);

    dailyFees.add(asset_vault, (totalSupply_vault * rate_vault) / 1e18 * vaultFees / YEAR);
    dailyRev.add(asset_vault, (totalSupply_vault * rate_vault) / 1e18 * vaultFees / YEAR);
  }

  //steth holding staking rewards
  dailyFees.add(STETH, stethFees + stethRevenue);
  dailyRev.add(STETH, (stethRevenue));

  //staking
  dailyRev.add(EETH, totalStakeFees);
  dailyFees.add(EETH, totalStakeFees * BigInt(10));

  return {
    dailyFees,
    dailyRevenue: dailyRev,
    dailyProtocolRevenue: dailyRev,
  };
};

const adapter: Adapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ETHEREUM],
  methodology: {
    Fees: "Staking/restaking rewards and Liquid Vault fees.",
    Revenue: "Staking/restaking rewards and Liquid Vault platform management fees.",
    ProtocolRevenue: "Staking/restaking rewards and Liquid Vault platform management fees.",
  },
  start: '2024-03-13'
};

export default adapter;
