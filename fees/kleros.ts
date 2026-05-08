import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// Contract addresses
// https://docs.kleros.io/developer/deployment-addresses
// https://github.com/kleros/kleros-v2/tree/dev/contracts/deployments
// https://github.com/kleros/kleros/blob/master/contracts/kleros/KlerosLiquid.sol
//https://github.com/kleros/kleros-v2/blob/master/contracts/src/arbitration/KlerosCoreBase.sol

const contracts = {
  [CHAIN.ARBITRUM]: {
    klerosCore: "0x991d2df165670b9cac3B022f4B68D65b664222ea",
  },
  [CHAIN.ETHEREUM]: {
    klerosLiquid: "0x988b3A538b618C7A603e1c11Ab82Cd16dbE28069",
  },
  [CHAIN.XDAI]: {
    xKlerosLiquid: "0x9C1dA9A04925bDfDedf0f6421bC7EEa8305F9002",
  },
};

const events = {
  // V2 (Arbitrum): emitted when juror rewards/penalties are executed after dispute resolution
  tokenAndETHShiftV2:
    "event TokenAndETHShift(address indexed _account, uint256 indexed _disputeID, uint256 indexed _roundID, uint256 _degreeOfCoherency, int256 _pnkAmount, int256 _feeAmount, address _feeToken)",
  // V2 (Arbitrum): emitted when undistributed fees are sent to the governor (rounding remainders or full fee when no juror is coherent)
  leftoverRewardSent:
    "event LeftoverRewardSent(uint256 indexed _disputeID, uint256 indexed _roundID, uint256 _pnkAmount, uint256 _feeAmount, address _feeToken)",
  // V1 (Ethereum, Gnosis): emitted when juror wins or loses tokens and ETH from a dispute
  tokenAndETHShiftV1:
    "event TokenAndETHShift(address indexed _address, uint256 indexed _disputeID, int256 _tokenAmount, int256 _ETHAmount)",
};

const fetchArbitrum = async ({ createBalances, getLogs }: FetchOptions) => {
  const dailyFees = createBalances();
  const dailySupplySideRevenue = createBalances();
  const dailyProtocolRevenue = createBalances();
  const { klerosCore } = contracts[CHAIN.ARBITRUM];

  // Juror fee rewards from dispute resolution
  const shiftLogs = await getLogs({
    target: klerosCore,
    eventAbi: events.tokenAndETHShiftV2,
  });

  for (const log of shiftLogs) {
    const feeAmount = Number(log._feeAmount);
    if (feeAmount > 0) {
      const feeToken = log._feeToken;
      if (feeToken === "0x0000000000000000000000000000000000000000") {
        dailyFees.addGasToken(feeAmount, "Arbitration Fees");
        dailySupplySideRevenue.addGasToken(feeAmount, "Arbitration Fees To Jurors");
      } else {
        dailyFees.add(feeToken, feeAmount, "Arbitration Fees");
        dailySupplySideRevenue.add(feeToken, feeAmount, "Arbitration Fees To Jurors");
      }
    }
  }

  // Leftover fees sent to governor (protocol revenue)
  const leftoverLogs = await getLogs({
    target: klerosCore,
    eventAbi: events.leftoverRewardSent,
  });

  for (const log of leftoverLogs) {
    const feeAmount = Number(log._feeAmount);
    if (feeAmount > 0) {
      const feeToken = log._feeToken;
      if (feeToken === "0x0000000000000000000000000000000000000000") {
        dailyFees.addGasToken(feeAmount, "Arbitration Fees");
        dailyProtocolRevenue.addGasToken(feeAmount, "Arbitration Fees To Governor");
      } else {
        dailyFees.add(feeToken, feeAmount, "Arbitration Fees");
        dailyProtocolRevenue.add(feeToken, feeAmount, "Arbitration Fees To Governor");
      }
    }
  }

  return {
    dailyFees,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const fetchEthereum = async ({ createBalances, getLogs }: FetchOptions) => {
  const dailyFees = createBalances();
  const dailySupplySideRevenue = createBalances();
  const dailyRevenue = createBalances();
  const { klerosLiquid } = contracts[CHAIN.ETHEREUM];

  // Juror ETH rewards from dispute resolution
  const shiftLogs = await getLogs({
    target: klerosLiquid,
    eventAbi: events.tokenAndETHShiftV1,
  });

  for (const log of shiftLogs) {
    const ethAmount = Number(log._ETHAmount);
    if (ethAmount > 0) {
      dailyFees.addGasToken(ethAmount, "Arbitration Fees");
      dailySupplySideRevenue.addGasToken(ethAmount, "Arbitration Fees To Jurors");
    }
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const fetchGnosis = async ({ createBalances, getLogs }: FetchOptions) => {
  const dailyFees = createBalances();
  const dailySupplySideRevenue = createBalances();
  const dailyRevenue = createBalances();
  const { xKlerosLiquid } = contracts[CHAIN.XDAI];

  // Juror xDAI rewards from dispute resolution
  const shiftLogs = await getLogs({
    target: xKlerosLiquid,
    eventAbi: events.tokenAndETHShiftV1,
  });

  for (const log of shiftLogs) {
    const ethAmount = Number(log._ETHAmount);
    if (ethAmount > 0) {
      dailyFees.addGasToken(ethAmount, "Arbitration Fees");
      dailySupplySideRevenue.addGasToken(ethAmount, "Arbitration Fees To Jurors");
    }
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Arbitration fees paid by dispute creators (from Escrow, Curate, and other arbitrable contracts).",
  Revenue: "Leftover fees sent to the governor when jurors are not fully coherent.",
  ProtocolRevenue: "Leftover fees sent to the governor when jurors are not fully coherent.",
  SupplySideRevenue: "Fees distributed as rewards to coherent jurors who vote correctly.",
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetchArbitrum,
      start: "2024-11-07",
    },
    [CHAIN.ETHEREUM]: {
      fetch: fetchEthereum,
      start: "2019-03-04",
    },
    [CHAIN.XDAI]: {
      fetch: fetchGnosis,
      start: "2021-07-03",
    },
  },
  methodology,
  breakdownMethodology: {
    Fees: {
      "Arbitration Fees": "Arbitration fees paid by dispute creators from Escrow, Curate, and other arbitrable contracts.",
    },
    SupplySideRevenue: {
      "Arbitration Fees To Jurors": "Arbitration fees distributed to jurors who voted coherently with the final ruling.",
    },
    Revenue: {
      "Arbitration Fees To Governor": "Arbitration fees forwarded to the Kleros governor when jurors are not fully coherent.",
    },
    ProtocolRevenue: {
      "Arbitration Fees To Governor": "Arbitration fees forwarded to the Kleros governor when jurors are not fully coherent.",
    },
  }
};

export default adapter;
