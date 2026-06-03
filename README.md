# PDF Barcode Generator

A professional Python utility to generate blank A4 PDF documents with unique serial numbers and Code 128 barcodes at the bottom right corner of each page.
https://barcode-75ym.onrender.com

## Features
- **A4 Layout**: Optimized specifically for standard A4 paper size.
- **Code 128 Barcodes**: Vector-drawn barcodes that print clean and scan easily.
- **Custom Serial Layout**: Automatically aligns the serial number text immediately to the left of the corresponding barcode.
- **Flexible Serial Modes**:
  - **Sequential Range**: Generate ranges such as `A1` to `A20`, `B100` to `B150`, etc.
  - **Custom List**: Provide a comma-separated list of custom serial numbers (e.g., `A1,B5,C12`).
  - **File Input**: Read serial numbers from a plain text file (one serial per line).
- **Interactive UI**: Run the script with no arguments to start a guided, interactive setup.
- **Premium CLI Output**: Color-coded configurations, progress bars, and execution panels.

---


## Custom Layout Adjustments
You can pass custom dimensions (in printer points, where `1 inch = 72 pt` or `1 mm ≈ 2.83 pt`) via CLI arguments:

- `--bar-width`: Controls the width of the narrowest barcode bar (default: `1.2`).
- `--bar-height`: Controls the height of the barcode (default: `30.0` or ~10.6mm).
- `--margin-right`: Distance of the barcode from the right page edge (default: `54.0` or ~19mm).
- `--margin-bottom`: Distance of the barcode from the bottom page edge (default: `54.0` or ~19mm).
- `--font-size`: The font size of the serial text (default: `14.0` or ~5mm).
- `--spacing`: Spacing between the text and the barcode (default: `15.0` or ~5.3mm).
