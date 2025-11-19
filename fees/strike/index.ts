import { compoundV2Export } from "../../helpers/compoundV2";

const comptrollers = {
  ethereum: "0xe2e17b2CBbf48211FA7eB8A875360e5e39bA2602",
};

export default compoundV2Export(
  comptrollers, 
  { 
    useExchangeRate: true,
    blacklists: [
      '0xc13fdf3af7ec87dca256d9c11ff96405d360f522',
      '0x1ebfd36223079dc79fefc62260db9e25f3f5e2c7',
    ],
  }
);
