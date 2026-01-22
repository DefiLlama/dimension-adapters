import { exportBuilderAdapter } from '../helpers/hyperliquid'

// https://www.echosync.io/en

const START = '2025-11-07';
const HL_BUILDER_ADDRESS = '0x831ad7eb3e600a3ab8df851ce27df8d8dd6b5d9c';

export default exportBuilderAdapter([HL_BUILDER_ADDRESS], { start: START })
