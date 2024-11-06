// https://etherfi.gitbook.io/etherfi/liquid/technical-documentation#fees
import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const LIQUID_VAULT_ETH = "0xf0bb20865277aBd641a307eCe5Ee04E79073416C";
const LIQUID_VAULT_ACCOUNTANT_ETH = "0x0d05D94a5F1E76C18fbeB7A13d17C8a314088198";
const LIQUID_VAULT_USD = "0x08c6F91e2B681FaF5e17227F2a44C307b3C1364C";
const LIQUID_VAULT_ACCOUNTANT_USD = "0xc315D6e14DDCDC7407784e2Caf815d131Bc1D3E7";
const EETH = "0x35fA164735182de50811E8e2E824cFb9B6118ac2";
const LIQUIDITY_POOL = "0x308861A430be4cce5502d0A12724771Fc6DaF216";
const YEAR = 365;

const getTotalSupply = async (options, target) => {
  return await options.api.call({
    target: target,
    abi: "function totalSupply() external view returns (uint256)",
  });
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

const fetch = async (options) => {
  const dailyFees = options.createBalances();

  // liquid earnings
  // eth vault
  const totalSupply_eth = await getTotalSupply(options, LIQUID_VAULT_ETH);
  const [asset_eth, rate_eth] = await getPayoutDetails(options, LIQUID_VAULT_ACCOUNTANT_ETH);

  // usd vault
  const totalSupply_usd = await getTotalSupply(options, LIQUID_VAULT_USD);
  const [asset_usd, rate_usd] = await getPayoutDetails(options, LIQUID_VAULT_ACCOUNTANT_USD);

  dailyFees.add(asset_eth, (totalSupply_eth * rate_eth) / 1e18 * 0.01 / YEAR);
  dailyFees.add(asset_usd, (totalSupply_usd * rate_usd) / 1e6 *  0.02 / YEAR);

  // get total staking fees earned
  let totalStakeFees = 0;
  const protocolFeesLog = await options.getLogs({
    target: LIQUIDITY_POOL,
    fromBlock: await options.getStartBlock(),
    toBlock: await options.getEndBlock(),
    eventAbi: "event ProtocolFeePaid(uint128 protocolFees)",
  });

  for (const log of protocolFeesLog) {
    totalStakeFees += log.protocolFees;
  }
  dailyFees.add(EETH, totalStakeFees);
  return { dailyFees };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      meta: {
        methodology: {
          totalFees:
            "Ether.fi-Liquid vault charges an annualized fee and staking fees are earned by the protocol.",
        },
      },
      start: 1710284400,
    },
  },
};

export default adapter;
