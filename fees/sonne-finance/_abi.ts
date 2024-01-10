import { ethers } from "ethers";

const comptrollerABI = {
  getAllMarkets: "function getAllMarkets() external view returns (address[])",
};
const comptrollerInterface = new ethers.Interface(
  Object.values(comptrollerABI)
);
const CTokenABI = {
  underlying: "function underlying() external view returns (address)",
  accrueInterest:"event AccrueInterest(uint256 cashPrior,uint256 interestAccumulated,uint256 borrowIndex,uint256 totalBorrows)",
  reserveFactorMantissa:
    "function reserveFactorMantissa() external view returns (uint256)",
};
const cTokenInterface = new ethers.Interface(Object.values(CTokenABI));

const veloGaugeAbi = {
  earned:
    "function earned(address token, address account) external view returns (uint256)",
  lastEarn:
    "function lastEarn(address token, address account) external view returns (uint256)",
};
const veloGaugeInterface = new ethers.Interface(
  Object.values(veloGaugeAbi)
);

export {
  comptrollerABI,
  comptrollerInterface,
  CTokenABI,
  cTokenInterface,
  veloGaugeAbi,
  veloGaugeInterface,
};
