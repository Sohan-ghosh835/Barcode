# PDF Barcode Generator

A professional Python utility to generate blank A4 PDF documents with unique serial numbers and Code 128 barcodes at the bottom right corner of each page.

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

## Installation & Setup

1. **Virtual Environment & Dependencies**:
   This project uses a Python virtual environment to isolate dependencies. Make sure you have Python 3.10+ installed.
   
   To set up and run:
   ```bash
   # Create a virtual environment (if not already done)
   python -m venv venv

   # Activate the virtual environment
   # On Windows:
   .\venv\Scripts\activate
   # On Linux/macOS:
   source venv/bin/activate

   # Install required dependencies
   pip install reportlab rich
   ```

---

## Usage Guide

### 1. Interactive Mode
Run the script without arguments or with `-i` / `--interactive`. It will walk you through setting up your PDF:
```bash
python generator.py
```

### 2. Command Line Mode (Automated)

#### Generate a range of pages (e.g., A1 to A20):
```bash
python generator.py --prefix A --start 1 --end 20 --output serials_A1_A20.pdf
```

#### Generate a custom comma-separated list of serials:
```bash
python generator.py --serials "A1,B9,X125,Z44" --output custom_serials.pdf
```

#### Generate from a text file:
Create a file named `serials.txt` with one serial number per line:
```text
A101
B202
C303
```
Then run:
```bash
python generator.py --file serials.txt --output from_file.pdf
```

---

## Custom Layout Adjustments
You can pass custom dimensions (in printer points, where `1 inch = 72 pt` or `1 mm ≈ 2.83 pt`) via CLI arguments:

- `--bar-width`: Controls the width of the narrowest barcode bar (default: `1.2`).
- `--bar-height`: Controls the height of the barcode (default: `30.0` or ~10.6mm).
- `--margin-right`: Distance of the barcode from the right page edge (default: `54.0` or ~19mm).
- `--margin-bottom`: Distance of the barcode from the bottom page edge (default: `54.0` or ~19mm).
- `--font-size`: The font size of the serial text (default: `14.0` or ~5mm).
- `--spacing`: Spacing between the text and the barcode (default: `15.0` or ~5.3mm).
