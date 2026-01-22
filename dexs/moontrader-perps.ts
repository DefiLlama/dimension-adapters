import { exportBuilderAdapter } from '../helpers/hyperliquid'

// https://www.moontrader.com/

const START = '2025-09-01';
const HL_BUILDER_ADDRESS = '0x38b176c674cd9a3b97a59b0a7045ba26a13783cb';

export default exportBuilderAdapter([HL_BUILDER_ADDRESS], { start: START })
