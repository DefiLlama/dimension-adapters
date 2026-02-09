import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

/* ---------- ABIs ---------- */

// v4
const abi_v4 = {
  nameRegistered:
    "event NameRegistered(string name,bytes32 indexed label,address indexed owner,uint256 baseCost,uint256 premium,uint256 expires)",
  nameRenewed:
    "event NameRenewed(string name,bytes32 indexed label,uint256 cost,uint256 expires)",
};

// v5
const abi_v5 = {
  nameRegistered:
    "event NameRegistered(string name,bytes32 indexed label,address indexed owner,uint256 cost,uint256 expires)",
  nameRenewed:
    "event NameRenewed(string name,bytes32 indexed label,uint256 cost,uint256 expires)",
};

const address_v4 = "0x283af0b28c62c092c9727f1ee09c02ca627eb7f5";
const address_v5 = "0x253553366da8546fc250f225fe3d25d0c782303b";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  /* ----- v4 registrations ----- */
  const v4Registered = await options.getLogs({
    target: address_v4,
    eventAbi: abi_v4.nameRegistered,
  });

  v4Registered.forEach((tx: any) => {
    const total = Number(tx.baseCost) + Number(tx.premium);
    if (total / 1e18 < 10) {
      dailyFees.addGasToken(total, "V4 name registration fees");
    }
  });

  /* ----- v5 registrations ----- */
  const v5Registered = await options.getLogs({
    target: address_v5,
    eventAbi: abi_v5.nameRegistered,
  });

  v5Registered.forEach((tx: any) => {
    if (Number(tx.cost) / 1e18 < 10) {
      dailyFees.addGasToken(tx.cost, "V5 name registration fees");
    }
  });

  /* ----- renewals (same for v4 & v5) ----- */
  const renewedLogs = await options.getLogs({
    targets: [address_v4, address_v5],
    eventAbi: abi_v4.nameRenewed,
  });

  renewedLogs.forEach((tx: any) => {
    if (Number(tx.cost) / 1e18 < 10) {
      dailyFees.addGasToken(tx.cost, "Name renewal fees");
    }
  });

  return {
    dailyFees,
    dailyRevenue: dailyFees,
  };
}

const methodology = {
  Fees: "ENS name registration and renewal costs",
  Revenue: "ENS name registration and renewal costs",
};


const adapter: Adapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: '2023-02-23',
  methodology,
  breakdownMethodology: {
    Fees: {
      "V4 name registration fees": "fees paid for .eth name registrations through the V4 ETHRegistrarController contract, including base cost and premium.",
      "V5 name registration fees": "fees paid for .eth name registrations through the V5 ETHRegistrarController contract.",
      "Name renewal fees": "fees paid for .eth name renewals through both V4 and V5 ETHRegistrarController contracts.",
    },
  },
};

export default adapter;
