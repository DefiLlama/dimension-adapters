import { Balances } from "@defillama/sdk";
import { FetchOptions } from "../../adapters/types";

const BondManagers = [
  "0x44b497aa4b742dc48Ce0bd26F66da9aecA19Bd75",
  "0xCA36616FFC16eAE1F33783a8CD082F46d9f2D993",
];

const BondCreatedEvent =
  "event BondCreated(uint256 indexed id, uint256 amount, uint256 price)";

const abiGetVariablesRaw =
  '{"inputs":[{"internalType":"uint256[]","name":"bondIds","type":"uint256[]"}],"name":"getBondVariables","outputs":[{"components":[{"internalType":"bool","name":"enabled","type":"bool"},{"internalType":"uint256","name":"capacity","type":"uint256"},{"internalType":"contract IERC20","name":"quoteToken","type":"address"},{"internalType":"uint256","name":"totalDebt","type":"uint256"},{"internalType":"uint256","name":"maxPayout","type":"uint256"},{"internalType":"uint256","name":"sold","type":"uint256"},{"internalType":"uint256","name":"purchased","type":"uint256"},{"internalType":"uint256","name":"startTime","type":"uint256"},{"internalType":"uint256","name":"endTime","type":"uint256"},{"internalType":"uint256","name":"initialPrice","type":"uint256"},{"internalType":"uint256","name":"finalPrice","type":"uint256"}],"internalType":"struct IAppBondDepository.Bond[]","name":"bonds","type":"tuple[]"},{"internalType":"uint256[]","name":"currentPrices","type":"uint256[]"}],"stateMutability":"view","type":"function"}';

const abiGetBondCountRaw =
  '{"inputs":[],"name":"bondLength","outputs":[{"internalType":"uint256","name":"out","type":"uint256"}],"stateMutability":"view","type":"function"}';

/**
 * Helper function to get the active bonds from the bond depository
 * @param options - The fetch options
 * @returns The active bonds
 */
const _getActiveBonds = async (options: FetchOptions) => {
  const abiGetVariables = JSON.parse(abiGetVariablesRaw);
  const abiGetBondCount = JSON.parse(abiGetBondCountRaw);

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
      if (!quoteToken) return;
      balances.add(quoteToken, log.amount);
      revenue.add(quoteToken, log.amount / 10n); // 10% of all bond sales go to treasury
    });
  });

  await Promise.all(promises);
};
