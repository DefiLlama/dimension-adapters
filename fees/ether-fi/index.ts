// https://etherfi.gitbook.io/etherfi/liquid/technical-documentation#fees
import { api } from "@defillama/sdk";
import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { ethers } from "ethers";
const sdk = require('@defillama/sdk')

const LIQUID_VAULT_ETH = "0xf0bb20865277aBd641a307eCe5Ee04E79073416C";
const LIQUID_VAULT_ACCOUNTANT_ETH = "0x0d05D94a5F1E76C18fbeB7A13d17C8a314088198";
const LIQUID_VAULT_USD = "0x08c6F91e2B681FaF5e17227F2a44C307b3C1364C";
const LIQUID_VAULT_ACCOUNTANT_USD = "0xc315D6e14DDCDC7407784e2Caf815d131Bc1D3E7";
const EETH = "0x35fA164735182de50811E8e2E824cFb9B6118ac2";
const EIGEN = "0xec53bf9167f50cdeb3ae105f56099aaab9061f83";
const LIQUIDITY_POOL = "0x308861A430be4cce5502d0A12724771Fc6DaF216";
const STETH = "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84";
const SSV = "0x9D65fF81a3c488d585bBfb0Bfe3c7707c7917f54";
const YEAR = 365;

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
  const WSTETH = "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0"
  const STETH = "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84"
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

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRev = options.createBalances();

  const totalSteth = await getTotalSteth(options);

  // liquid earnings
  // eth vault
  const totalSupply_eth = await getTotalSupply(options, LIQUID_VAULT_ETH);
  const [asset_eth, rate_eth] = await getPayoutDetails(options, LIQUID_VAULT_ACCOUNTANT_ETH);

  // usd vault
  const totalSupply_usd = await getTotalSupply(options, LIQUID_VAULT_USD);
  const [asset_usd, rate_usd] = await getPayoutDetails(options, LIQUID_VAULT_ACCOUNTANT_USD);

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

  //liquid
  dailyFees.add(asset_eth, (totalSupply_eth * rate_eth) / 1e18 * 0.01 / YEAR);
  dailyFees.add(asset_usd, (totalSupply_usd * rate_usd) / 1e6 * 0.02 / YEAR);
  dailyRev.add(asset_eth, (totalSupply_eth * rate_eth) / 1e18 * 0.01 / YEAR);
  dailyRev.add(asset_usd, (totalSupply_usd * rate_usd) / 1e6 * 0.02 / YEAR);

  //steth holding staking rewards
  dailyFees.add(STETH, BigInt(stethFees) + BigInt(stethRevenue));
  dailyRev.add(STETH, (stethRevenue));

  //staking
  dailyRev.add(EETH, totalStakeFees);
  dailyFees.add(EETH, totalStakeFees * BigInt(10));

  return {
    dailyFees: dailyFees,
    dailyRevenue: dailyRev,
  };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      meta: {
        methodology: {
          Fees: "Staking/Restaking rewards earned by all staked ETH + Fees on Liquid Vaults",
          Revenue: "Staking/Restaking rewards + Fees on Liquid Vaults",
        },
      },
      start: '2024-03-13',
    },
  },
};

export default adapter;
