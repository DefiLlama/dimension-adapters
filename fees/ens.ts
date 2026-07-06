import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// ENS .eth registrar controllers, oldest -> newest.
// The 2019 and 2020 controllers report a single combined `cost` in NameRegistered; the current
// controller (deployed 2023-03) splits it into `baseCost` + temporary Dutch-auction `premium`.
// (Verified on-chain: 0x283af0 emits cost-only, 0x253553 emits baseCost+premium.) All three
// share the same NameRenewed signature.
const controllers_cost = [
  "0xf0ad5cad05e10572efceb849f6ff0c68f9700455", // 2019 launch
  "0x283af0b28c62c092c9727f1ee09c02ca627eb7f5", // 2020
];
const controller_premium = "0x253553366da8546fc250f225fe3d25d0c782303b"; // 2023-03 (current)
const all_controllers = [...controllers_cost, controller_premium];

const nameRegistered_cost =
  "event NameRegistered(string name,bytes32 indexed label,address indexed owner,uint256 cost,uint256 expires)";
const nameRegistered_premium =
  "event NameRegistered(string name,bytes32 indexed label,address indexed owner,uint256 baseCost,uint256 premium,uint256 expires)";
const nameRenewed =
  "event NameRenewed(string name,bytes32 indexed label,uint256 cost,uint256 expires)";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  // Registrations on the 2019 + 2020 controllers: single combined cost.
  const costRegs = await options.getLogs({ targets: controllers_cost, eventAbi: nameRegistered_cost });
  costRegs.forEach((tx: any) => dailyFees.addGasToken(tx.cost, "Name registration fees"));

  // Current controller: base cost + temporary (Dutch-auction) premium, both real treasury
  // revenue, so count the full amount. The premium is a legitimate auction price (a 21-day
  // exponential decay from a high start down to 0 on recently-expired names), not a data glitch,
  // so there is nothing anomalous to cap.
  const premiumRegs = await options.getLogs({ target: controller_premium, eventAbi: nameRegistered_premium });
  premiumRegs.forEach((tx: any) =>
    dailyFees.addGasToken(Number(tx.baseCost) + Number(tx.premium), "Name registration fees")
  );

  // Renewals: same event across every controller.
  const renewals = await options.getLogs({ targets: all_controllers, eventAbi: nameRenewed });
  renewals.forEach((tx: any) => dailyFees.addGasToken(tx.cost, "Name renewal fees"));

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

// Per ENS docs: 100% of registration + renewal fees flow through the ETHRegistrarController to the
// ENS DAO treasury. There is no supply-side split, no distribution to ENS token holders, and no
// buyback - so fees, revenue and protocol revenue are all equal.
const methodology = {
  Fees: "ENS .eth name registration and renewal costs (base cost plus temporary premium) across every registrar controller since the 2019 launch.",
  Revenue: "Same as fees: ENS keeps 100% of registration and renewal costs in the DAO treasury, so revenue equals fees.",
  ProtocolRevenue: "Same as revenue: all fees accrue to the ENS DAO treasury. ENS token holders receive no direct fee distribution and there is no buyback.",
};

const adapter: Adapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: '2019-05-04', // ENS .eth permanent registrar launch (legacy controller 0xf0ad5cad)
  methodology,
  breakdownMethodology: {
    Fees: {
      "Name registration fees": "Cost paid to register .eth names across all ETHRegistrarController versions. The 2019 and 2020 controllers report a single combined cost; the current controller (2023+) reports base cost plus temporary Dutch-auction premium, both counted in full.",
      "Name renewal fees": "Cost paid to renew .eth names across all ETHRegistrarController versions.",
    },
  },
};

export default adapter;
