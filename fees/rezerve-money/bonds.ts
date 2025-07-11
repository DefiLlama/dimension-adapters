import ADDRESSES from "../../helpers/coreAssets.json";
import { Balances } from "@defillama/sdk";
import { FetchOptions } from "../../adapters/types";
import ABIReader from "./bondreaderabi.json";
import ABIBondDepository from "./bonddepository.json";

const BondManagers = [
  "0x44b497aa4b742dc48Ce0bd26F66da9aecA19Bd75",
  "0xCA36616FFC16eAE1F33783a8CD082F46d9f2D993",
];

const BondCreatedEvent =
  "event BondCreated(uint256 indexed id, uint256 amount, uint256 price)";

/**
 * Helper function to get the active bonds from the bond depository
 * @param options - The fetch options
 * @returns The active bonds
 */
const _getActiveBonds = async (options: FetchOptions) => {
  const abiGetVariables = ABIReader.filter(
    (a) => a.name === "getBondVariables"
  )[0];
  const abiGetBondCount = ABIBondDepository.filter(
    (a) => a.name === "bondLength"
  )[0];

  const bondCount = await options.api.call({
    target: "0x44b497aa4b742dc48Ce0bd26F66da9aecA19Bd75",
    abi: abiGetBondCount,
  });

  const bondIds = Array.from({ length: bondCount }, (_, i) => i);
  const activeBonds = await options.api.call({
    target: "0xe70de19cee299399017c63172a6b704E92D9B376",
    params: [bondIds as any as string],
    abi: abiGetVariables,
  });

  return activeBonds[0].map((bond, index) => ({
    id: index,
    quoteToken: bond.quoteToken,
  }));
};

/**
 * Fetch the bond data
 * @param balances - The balances
 * @param revenue - The revenue
 * @param options - The fetch options
 */
export const fetchBond = async (
  balances: Balances,
  revenue: Balances,
  options: FetchOptions
) => {
  const activeBonds = await _getActiveBonds(options);

  const promises = BondManagers.map(async (bondManager) => {
    const data: any[] = await options.getLogs({
      target: bondManager,
      eventAbi: BondCreatedEvent,
    });

    data.forEach((log: any) => {
      const quoteToken = activeBonds.find(
        (bond) => Number(bond.id) === Number(log.id)
      )?.quoteToken;
      console.log(quoteToken);
      if (!quoteToken) return;
      balances.add(quoteToken, log.amount);
      revenue.add(quoteToken, log.amount / 10n); // 10% of all bond sales go to treasury
    });
  });

  await Promise.all(promises);
};
