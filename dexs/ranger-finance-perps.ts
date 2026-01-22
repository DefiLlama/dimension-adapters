import { exportBuilderAdapter } from '../helpers/hyperliquid'

// https://ranger.finance/

const START = '2025-08-12';
const HL_BUILDER_ADDRESS = '0xf5bc9107916b91a3ea5966cd2e51655d21b7eb02';

export default exportBuilderAdapter([HL_BUILDER_ADDRESS], { start: START })
