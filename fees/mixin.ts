import { blockscoutFeeAdapter } from "../helpers/blockscoutFees";

// DO NOT LIST, unsure if correct
export default blockscoutFeeAdapter("mixin", "https://scan.mvm.dev/api?module=stats&action=totalfees", "mixin")