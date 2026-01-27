import { compoundV2Export } from "../../helpers/compoundV2";

const comptrollers = {
  shimmer_evm: "0xF7E452A8685D57083Edf4e4CC8064EcDcF71D7B7",
  iotaevm: "0xee07121d97FDEA35675e02017837a7a43aeDa48F",
};

export default compoundV2Export(comptrollers, { holdersRevenueRatio: 1 });
