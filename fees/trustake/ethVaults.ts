import { FetchOptions } from "../../adapters/types";
import { METRIC } from "../../helpers/metrics";
import ADDRESSES from "../../helpers/coreAssets.json";
import { PROTOCOL_FEE_RATE, SUPPLY_SIDE_RATE } from "./shared";

const TRUMATIC_VAULT = "0xA43A7c62D56dF036C187E1966c03E2799d8987ed";
const TRUPOL_VAULT = "0xc10214cdE5d6754Ec1e2220362f2120142c8E5e8";

const vaults = [
  { address: TRUMATIC_VAULT, token: ADDRESSES.ethereum.MATIC },
  { address: TRUPOL_VAULT, token: ADDRESSES.ethereum.POL },
];

const abis = {
  convertToAssets: "function convertToAssets(uint256) view returns (uint256)",
  totalSupply: "uint256:totalSupply",
};

export const fetchEthVaults = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  for (const vault of vaults) {
    const [rateBefore, rateAfter, totalSupply] = await Promise.all([
      options.fromApi.call({ target: vault.address, abi: abis.convertToAssets, params: [(1e18).toString()], permitFailure: true }),
      options.toApi.call({ target: vault.address, abi: abis.convertToAssets, params: [(1e18).toString()], permitFailure: true }),
      options.fromApi.call({ target: vault.address, abi: abis.totalSupply, permitFailure: true }),
    ]);
    if (!rateBefore || !rateAfter || !totalSupply) continue;
    if (Number(rateAfter) <= Number(rateBefore)) continue;

    const rateChange = Number(rateAfter) - Number(rateBefore);
    const stakingRewards = (Number(totalSupply) * rateChange) / 1e18;
    const grossYield = stakingRewards / SUPPLY_SIDE_RATE;
    const protocolRevenue = grossYield * PROTOCOL_FEE_RATE;

    dailyFees.add(vault.token, grossYield, METRIC.STAKING_REWARDS);
    dailySupplySideRevenue.add(vault.token, stakingRewards, METRIC.STAKING_REWARDS);
    dailyRevenue.add(vault.token, protocolRevenue, METRIC.SERVICE_FEES);
    dailyProtocolRevenue.add(vault.token, protocolRevenue, METRIC.SERVICE_FEES);
  }
  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue };
};
