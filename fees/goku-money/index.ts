import ADDRESSES from '../../helpers/coreAssets.json'
import * as sdk from "@defillama/sdk";
import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { Chain } from "../../adapters/types";

const BORROW_CONTRACT_ADDRESS = [
  "0x2f6E14273514bc53deC831028CB91cB1D7b78237", // USDC
  "0x2D18cE2adC5B7c4d8558b62D49A0137A6B87049b", // USDT
  "0x7519eC4d295Ca490EaC618a80B3cc42c258F6000", // WETH
  "0xEC52881A8AEbFEB5576c08FBD1e4203f51B36524", // TIA
  "0x95CeF13441Be50d20cA4558CC0a27B601aC544E5", // MANTA
];

const PYTH_CONFIG = {
  USDC: {
    contractAddress: "0x5B27B4ACA9573F26dd12e30Cb188AC53b177006e",
    address: ADDRESSES.manta.USDC,
  },
  USDT: {
    contractAddress: "0x2D18cE2adC5B7c4d8558b62D49A0137A6B87049b",
    address: ADDRESSES.manta.USDT,
  },
  WETH: {
    contractAddress: "0x17Efd0DbAAdc554bAFDe3cC0E122f0EEB94c8661",
    address: ADDRESSES.manta.WETH,
  },
  TIA: {
    contractAddress: "0xaa41F9e1f5B6d27C22f557296A0CDc3d618b0113",
    address: '0x6Fae4D9935E2fcb11fC79a64e917fb2BF14DaFaa',
  },
  MANTA: {
    contractAddress: "0x3683Ee89f1928B69962D20c08315bb7059C21dD9",
    address: '0x95CeF13441Be50d20cA4558CC0a27B601aC544E5',
  },
};
type PYTH_CONFIG_TYPE = typeof PYTH_CONFIG;
type PYTH_CONFIG_KEYS = keyof PYTH_CONFIG_TYPE;

const fetchGaiRevenue = async (getLogs: any, balances: sdk.Balances) => {
  const logs = await getLogs({
    targets: BORROW_CONTRACT_ADDRESS,
    eventAbi: "event GAIBorrowingFeePaid(address indexed _borrower, uint256 _GAIFee)",
  });

  logs.forEach(log => balances.add('0xcd91716ef98798A85E79048B78287B13ae6b99b2', log._GAIFee))
};

const fetchCollateralRedemptionRevenue = async (getLogs: any, balances: sdk.Balances) => {
  for (const token of Object.keys(PYTH_CONFIG) as PYTH_CONFIG_KEYS[]) {
    const { contractAddress, address, } = PYTH_CONFIG[token];
    const logs = await getLogs({
      target: contractAddress,
      eventAbi: "event Redemption(uint256 _attemptedGAIAmount, uint256 _actualGAIAmount, uint256 _COLSent, uint256 _COLFee)",
    });

    for (const log of logs)
      balances.add(address, log._COLFee)
  }
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.MANTA]: {
      fetch: async ({ getLogs }: FetchOptions) => {
        const balances = new sdk.Balances({ chain: CHAIN.MANTA as Chain });
        await fetchGaiRevenue(getLogs, balances);
        await fetchCollateralRedemptionRevenue(getLogs, balances);

        const totalRevenue = await balances.getUSDString()
        return {
          dailyFees: totalRevenue,
          dailyRevenue: totalRevenue,
          dailyHoldersRevenue: totalRevenue,
        };
      },
      start: '2023-10-31', // 01 Nov 2023
    },
  },
  methodology: {
    Fees: "Interest and redemption fees paid by borrowers",
    Revenue: "Interest and redemption fees paid by borrowers",
    ProtocolRevenue: "Interest and redemption fees paid by borrowers",
    HoldersRevenue: "Interest and redemption fees paid by borrowers"
  }
};

export default adapter;
