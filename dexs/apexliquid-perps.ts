import { exportBuilderAdapter } from '../helpers/hyperliquid'

// https://apexliquid.bot/trade/topTraders

const START = '2025-07-06';
const HL_BUILDER_ADDRESS = '0xe1f55f2f25884c2ddc86b6f7efa5f45b2ef04221';

export default exportBuilderAdapter([HL_BUILDER_ADDRESS], { start: START })
