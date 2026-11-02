import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// ENS .eth registrar controllers, oldest -> newest. Verified against ENS's own Dune model
// (ethereumnameservice_ethereum.ETHRegistrarController_1..5) and the on-chain event schemas.
// NameRegistered comes in three shapes:
//   - controllers 1-3 (2019-2023): a single combined `cost`
//   - controller 4 (0x253553, 2023):    baseCost + premium
//   - controller 5 (0x59e16f, current): baseCost + premium + referrer (label/labelhash naming)
// NameRenewed is the classic 4-field event on controllers 1-4 and a 5-field (referrer) event on 5.
const controllers_cost = [
  "0xf0ad5cad05e10572efceb849f6ff0c68f9700455", // 1 - 2019 launch
  "0xb22c1c159d12461ea124b0deb4b5b93020e6ad16", // 2 - 2019
  "0x283af0b28c62c092c9727f1ee09c02ca627eb7f5", // 3 - 2020
];
const controller_premium = "0x253553366da8546fc250f225fe3d25d0c782303b"; // 4 - 2023
const controller_referrer = "0x59e16fccd424cc24e280be16e11bcd56fb0ce547"; // 5 - last v1 controller

// ENSv2 went live on 2026-10-27 and permanently disabled new registrations on the v1
// controllers above. Registrations now emit NameRegistered on the ENSv2 ETHRegistrar and are
// paid in the token the registrant chose (USDC on-chain today), and renewals for names that
// stayed on v1 are routed through ETHRenewerV1 - a direct v1 controller `renew()` reverts. Both
// surfaces must be read or ENS fees drop to zero from 2026-10-28 onward.
// Both addresses are from the canonical deployment list at docs.ens.domains/learn/deployments/
// (confirmed verified on a block explorer).
const ens_v2_registrar = "0xd6d8369e55c94ae8afa714e6cf7ab5be54d5cc81"; // ENSv2 ETHRegistrar
const ens_v2_renewer_v1 = "0x56c447f308f463a01121c41e72b0e7e7557fcb68"; // ENSv2 ETHRenewerV1

const registered_cost =
  "event NameRegistered(string name, bytes32 indexed label, address indexed owner, uint256 cost, uint256 expires)";
const registered_premium =
  "event NameRegistered(string name, bytes32 indexed label, address indexed owner, uint256 baseCost, uint256 premium, uint256 expires)";
const registered_referrer =
  "event NameRegistered(string label, bytes32 indexed labelhash, address indexed owner, uint256 baseCost, uint256 premium, uint256 expires, bytes32 referrer)";
const renewed =
  "event NameRenewed(string name, bytes32 indexed label, uint256 cost, uint256 expires)";
const renewed_referrer =
  "event NameRenewed(string label, bytes32 indexed labelhash, uint256 cost, uint256 expires, bytes32 referrer)";

// ENSv2 emits the amount in the payment token, not the gas token. ETHRenewerV1 uses the same
// canonical signature for NameRenewed, so one ABI covers both v2 contracts.
const registered_v2 =
  "event NameRegistered(uint256 indexed tokenId, string label, address owner, address subregistry, address resolver, uint64 duration, address paymentToken, bytes32 indexed referrer, uint256 base, uint256 premium)";
const renewed_v2 =
  "event NameRenewed(uint256 indexed tokenId, string label, uint64 duration, uint64 newExpiry, address paymentToken, bytes32 indexed referrer, uint256 amount)";

const REGISTRATION = "Name registration fees";
const RENEWAL = "Name renewal fees";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  // Controllers 1-3: single combined cost.
  const costRegs = await options.getLogs({ targets: controllers_cost, eventAbi: registered_cost });
  costRegs.forEach((tx: any) => dailyFees.addGasToken(tx.cost, REGISTRATION));

  // Controllers 4 & 5: base cost + temporary Dutch-auction premium, both real treasury revenue,
  // counted in full. The premium is a legitimate auction price (a 21-day exponential decay from a
  // high start down to 0 on recently-expired names), not a data glitch, so there is nothing to cap.
  // Controller 5 also records a `referrer`, but the full baseCost + premium is collected by the
  // treasury (referralFee is 0 on-chain today); if a non-zero referral split is ever activated the
  // referred portion would need to move to supply-side revenue.
  const premiumRegs = await options.getLogs({ target: controller_premium, eventAbi: registered_premium });
  const referrerRegs = await options.getLogs({ target: controller_referrer, eventAbi: registered_referrer });
  [...premiumRegs, ...referrerRegs].forEach((tx: any) =>
    dailyFees.addGasToken(BigInt(tx.baseCost) + BigInt(tx.premium), REGISTRATION)
  );

  // Renewals. Unit quirk: the 2023 controller (0x253553) emits NameRenewed.cost in USD
  // (attoUSD, 1e18 = $1), NOT ETH wei - a known bug in that controller version. Its
  // registration events are still ETH, and the 2019/2020 controllers and the current controller
  // (0x59e16f) emit renewal cost in ETH. ENS's own analytics work around this with a dedicated
  // conversion table; here we add the 2023 controller's renewals as a USD value and the rest as
  // the gas token. Verified on-chain: a 0x253553 renewal tx sending 0.22 ETH emits cost summing
  // to ~257 (=$257), while a 0x59e16f renewal of 0.0065 ETH emits cost 0.0064 (ETH).
  const renewalsEth = await options.getLogs({ targets: controllers_cost, eventAbi: renewed });
  renewalsEth.forEach((tx: any) => dailyFees.addGasToken(tx.cost, RENEWAL));

  const referrerRenewals = await options.getLogs({ target: controller_referrer, eventAbi: renewed_referrer });
  referrerRenewals.forEach((tx: any) => dailyFees.addGasToken(tx.cost, RENEWAL));

  const renewalsUsd = await options.getLogs({ target: controller_premium, eventAbi: renewed });
  renewalsUsd.forEach((tx: any) => dailyFees.addUSDValue(Number(tx.cost) / 1e18, RENEWAL));

  // ENSv2 (from 2026-10-27). Amounts are denominated in `paymentToken`, so they are added per
  // token instead of as the gas token. 100% still goes to the ENS treasury.
  const v2Regs = await options.getLogs({ target: ens_v2_registrar, eventAbi: registered_v2 });
  v2Regs.forEach((tx: any) =>
    dailyFees.add(tx.paymentToken, BigInt(tx.base) + BigInt(tx.premium), REGISTRATION)
  );

  const v2Renewals = await options.getLogs({ target: ens_v2_registrar, eventAbi: renewed_v2 });
  v2Renewals.forEach((tx: any) => dailyFees.add(tx.paymentToken, tx.amount, RENEWAL));

  const v1RenewalsOnV2 = await options.getLogs({ target: ens_v2_renewer_v1, eventAbi: renewed_v2 });
  v1RenewalsOnV2.forEach((tx: any) => dailyFees.add(tx.paymentToken, tx.amount, RENEWAL));

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
  pullHourly: true, // every query is bounded by the requested window, so hourly runs are safe
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: '2019-05-04', // ENS .eth permanent registrar launch (controller 1, 0xf0ad5cad)
  methodology,
  breakdownMethodology: {
    Fees: {
      "Name registration fees": "Cost paid to register .eth names across all ETHRegistrarController versions and the ENSv2 ETHRegistrar. The 2019-2020 controllers report a single combined cost; the 2023+ controllers report base cost plus temporary Dutch-auction premium, both counted in full. ENSv2 registrations are paid in the token the registrant chose (USDC on-chain today).",
      "Name renewal fees": "Cost paid to renew .eth names across all ETHRegistrarController versions, the ENSv2 ETHRegistrar, and ETHRenewerV1 (which handles renewals for names that stayed on ENSv1).",
    },
  },
};

export default adapter;
