import argparse
import sys
import os
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.graphics.barcode import code128

from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn, TaskProgressColumn
from rich.prompt import Prompt, Confirm, IntPrompt

console = Console()

def generate_pdf(output_path, serials, bar_width, bar_height, margin_right, margin_bottom, font_size, font_name, spacing, position='bottom-right', show_serial_text=True, show_progress=False):
    width, height = A4
    total_pages = len(serials)
    
    if position not in {'bottom-right', 'bottom-left', 'top-right', 'top-left'}:
        position = 'bottom-right'
    
    if show_progress:
        summary_table = Table(title="[bold cyan]PDF Generation Config[/bold cyan]", title_justify="left", show_header=True, header_style="bold magenta")
        summary_table.add_column("Property", style="dim")
        summary_table.add_column("Value", style="bold")
        
        summary_table.add_row("Output File", str(output_path))
        summary_table.add_row("Total Pages", str(total_pages))
        summary_table.add_row("Serial Sample", f"{serials[0]} ... {serials[-1]}" if total_pages > 1 else serials[0])
        summary_table.add_row("Paper Size", "A4 (210mm x 297mm)")
        summary_table.add_row("Barcode Height", f"{bar_height} pt (~{bar_height * 0.3527:.1f} mm)")
        summary_table.add_row("Barcode Narrow Bar Width", f"{bar_width} pt")
        summary_table.add_row("Right Margin", f"{margin_right} pt (~{margin_right * 0.3527:.1f} mm)")
        summary_table.add_row("Bottom Margin", f"{margin_bottom} pt (~{margin_bottom * 0.3527:.1f} mm)")
        summary_table.add_row("Font Style & Size", f"{font_name} @ {font_size} pt")
        summary_table.add_row("Font-to-Barcode Spacing", f"{spacing} pt (~{spacing * 0.3527:.1f} mm)")
        
        console.print(summary_table)
        console.print()

    c = canvas.Canvas(output_path, pagesize=A4)
    
    if show_progress:
        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            BarColumn(bar_width=40),
            TaskProgressColumn(),
            console=console
        ) as progress:
            task = progress.add_task("[yellow]Creating PDF pages...", total=total_pages)
            
            for idx, serial_str in enumerate(serials):
                if idx > 0:
                    c.showPage()
                    
                progress.update(task, description=f"[yellow]Drawing Page {idx+1}/{total_pages} ({serial_str})...")
                
                barcode = code128.Code128(
                    serial_str,
                    barHeight=bar_height,
                    barWidth=bar_width,
                    humanReadable=0
                )
                
                x_barcode = width - margin_right - barcode.width if position.endswith('right') else margin_right
                y_barcode = margin_bottom if position.startswith('bottom') else height - margin_bottom - bar_height
                barcode.drawOn(c, x_barcode, y_barcode)
                
                if show_serial_text:
                    c.setFont(font_name, font_size)
                    cap_height = font_size * 0.7
                    y_text = y_barcode + (bar_height - cap_height) / 2
                    if position.endswith('right'):
                        x_text = x_barcode - spacing
                        c.drawRightString(x_text, y_text, serial_str)
                    else:
                        x_text = x_barcode + barcode.width + spacing
                        c.drawString(x_text, y_text, serial_str)
                
                progress.advance(task)
                
            progress.update(task, description="[green]Saving PDF file...")
            c.save()
            
        try:
            loc = os.path.abspath(output_path) if isinstance(output_path, str) else "Memory Buffer"
        except Exception:
            loc = "Memory Buffer"
            
        console.print(Panel.fit(
            f"[bold green]SUCCESS: PDF generated successfully![/bold green]\n"
            f"[bold white]File Location:[/bold white] [underline cyan]{loc}[/underline cyan]\n"
            f"[bold white]Pages:[/bold white] {total_pages}",
            title="Success",
            border_style="green"
        ))
    else:
        for idx, serial_str in enumerate(serials):
            if idx > 0:
                c.showPage()
                
            barcode = code128.Code128(
                serial_str,
                barHeight=bar_height,
                barWidth=bar_width,
                humanReadable=0
            )
            
            x_barcode = width - margin_right - barcode.width if position.endswith('right') else margin_right
            y_barcode = margin_bottom if position.startswith('bottom') else height - margin_bottom - bar_height
            barcode.drawOn(c, x_barcode, y_barcode)
            
            if show_serial_text:
                c.setFont(font_name, font_size)
                cap_height = font_size * 0.7
                y_text = y_barcode + (bar_height - cap_height) / 2
                if position.endswith('right'):
                    x_text = x_barcode - spacing
                    c.drawRightString(x_text, y_text, serial_str)
                else:
                    x_text = x_barcode + barcode.width + spacing
                    c.drawString(x_text, y_text, serial_str)
            
        c.save()

def interactive_mode():
    console.print(Panel(
        "[bold cyan]Welcome to the PDF Barcode Generator[/bold cyan]\n"
        "This tool generates a blank PDF with sequential or custom Code 128 barcodes and serial numbers on each page.",
        title="Interactive Setup",
        border_style="cyan"
    ))
    
    gen_type = Prompt.ask(
        "Select serial number source", 
        choices=["range", "custom", "file"], 
        default="range"
    )
    
    serials = []
    
    if gen_type == "range":
        prefix = Prompt.ask("Enter serial prefix (e.g. A, B, barcode)", default="A")
        start = IntPrompt.ask("Enter start number", default=1)
        end = IntPrompt.ask("Enter end number", default=20)
        
        while start > end:
            console.print("[red]Start number must be less than or equal to end number.[/red]")
            start = IntPrompt.ask("Enter start number", default=1)
            end = IntPrompt.ask("Enter end number", default=20)
            
        serials = [f"{prefix}{num}" for num in range(start, end + 1)]
        
    elif gen_type == "custom":
        custom_input = Prompt.ask("Enter serial numbers (comma-separated, e.g. A1,B5,C12)")
        serials = [s.strip() for s in custom_input.split(",") if s.strip()]
        while not serials:
            console.print("[red]Please enter at least one valid serial number.[/red]")
            custom_input = Prompt.ask("Enter serial numbers (comma-separated)")
            serials = [s.strip() for s in custom_input.split(",") if s.strip()]
            
    elif gen_type == "file":
        file_path = Prompt.ask("Enter path to file containing serials (one per line)")
        while not os.path.isfile(file_path):
            console.print(f"[red]File '{file_path}' does not exist.[/red]")
            file_path = Prompt.ask("Enter path to file containing serials")
            
        with open(file_path, "r") as f:
            serials = [line.strip() for line in f if line.strip()]
            
        if not serials:
            console.print("[red]The file is empty! Exiting.[/red]")
            sys.exit(1)

    output_path = Prompt.ask("Enter output PDF path", default="barcoded_output.pdf")
    if not output_path.lower().endswith(".pdf"):
        output_path += ".pdf"
        
    customize = Confirm.ask("Would you like to customize margins, sizes or spacing?", default=False)
    
    bar_width = 1.2
    bar_height = 30.0
    margin_right = 54.0
    margin_bottom = 54.0
    font_size = 14.0
    font_name = "Helvetica-Bold"
    spacing = 15.0
    
    if customize:
        bar_width = float(Prompt.ask("Narrow bar width (pt)", default=str(bar_width)))
        bar_height = float(Prompt.ask("Barcode height (pt)", default=str(bar_height)))
        margin_right = float(Prompt.ask("Right margin (pt)", default=str(margin_right)))
        margin_bottom = float(Prompt.ask("Bottom margin (pt)", default=str(margin_bottom)))
        font_size = float(Prompt.ask("Serial text font size (pt)", default=str(font_size)))
        font_name = Prompt.ask("Font name", choices=["Helvetica", "Helvetica-Bold", "Times-Roman", "Times-Bold", "Courier", "Courier-Bold"], default=font_name)
        spacing = float(Prompt.ask("Spacing between text and barcode (pt)", default=str(spacing)))
        
    generate_pdf(
        output_path=output_path,
        serials=serials,
        bar_width=bar_width,
        bar_height=bar_height,
        margin_right=margin_right,
        margin_bottom=margin_bottom,
        font_size=font_size,
        font_name=font_name,
        spacing=spacing,
        show_progress=True
    )

def main():
    parser = argparse.ArgumentParser(description="Generate blank A4 PDFs with unique serial numbers and Code 128 barcodes at the bottom right.")
    parser.add_argument("-i", "--interactive", action="store_true", help="Run in interactive CLI mode")
    parser.add_argument("--prefix", type=str, default=None, help="Prefix for the serial numbers (e.g. 'A')")
    parser.add_argument("--start", type=int, default=None, help="Starting number for the serial sequence")
    parser.add_argument("--end", type=int, default=None, help="Ending number for the serial sequence")
    parser.add_argument("--serials", type=str, default=None, help="Comma-separated list of custom serial numbers (overrides prefix/start/end)")
    parser.add_argument("--file", type=str, default=None, help="File containing serial numbers, one per line (overrides prefix/start/end)")
    parser.add_argument("--output", type=str, default="barcoded_output.pdf", help="Output PDF file path (default: barcoded_output.pdf)")
    parser.add_argument("--bar-width", type=float, default=1.2, help="Width of barcode bars (default: 1.2)")
    parser.add_argument("--bar-height", type=float, default=30.0, help="Height of barcode bars in points (default: 30.0)")
    parser.add_argument("--margin-right", type=float, default=54.0, help="Margin from the right edge in points (default: 54.0)")
    parser.add_argument("--margin-bottom", type=float, default=54.0, help="Margin from the bottom edge in points (default: 54.0)")
    parser.add_argument("--font-size", type=float, default=14.0, help="Font size of the serial number text (default: 14.0)")
    parser.add_argument("--font-name", type=str, default="Helvetica-Bold", help="Font name for the serial number (default: Helvetica-Bold)")
    parser.add_argument("--spacing", type=float, default=15.0, help="Spacing between the serial number text and barcode (default: 15.0)")

    args = parser.parse_args()
    
    if args.interactive or (args.prefix is None and args.serials is None and args.file is None):
        try:
            interactive_mode()
        except (KeyboardInterrupt, EOFError):
            console.print("\n[yellow]Generation cancelled by user.[/yellow]")
            sys.exit(0)
        return
        
    serials = []
    if args.file:
        if not os.path.isfile(args.file):
            console.print(f"[bold red]Error: File '{args.file}' does not exist.[/bold red]")
            sys.exit(1)
        with open(args.file, "r") as f:
            serials = [line.strip() for line in f if line.strip()]
        if not serials:
            console.print(f"[bold red]Error: File '{args.file}' contains no valid serial numbers.[/bold red]")
            sys.exit(1)
    elif args.serials:
        serials = [s.strip() for s in args.serials.split(",") if s.strip()]
        if not serials:
            console.print("[bold red]Error: No valid serial numbers provided in list.[/bold red]")
            sys.exit(1)
    else:
        prefix = args.prefix if args.prefix is not None else "A"
        start = args.start if args.start is not None else 1
        end = args.end if args.end is not None else 20
        
        if start > end:
            console.print("[bold red]Error: Starting number cannot be greater than the ending number.[/bold red]")
            sys.exit(1)
            
        serials = [f"{prefix}{num}" for num in range(start, end + 1)]
        
    output_path = args.output
    if not output_path.lower().endswith(".pdf"):
        output_path += ".pdf"
        
    generate_pdf(
        output_path=output_path,
        serials=serials,
        bar_width=args.bar_width,
        bar_height=args.bar_height,
        margin_right=args.margin_right,
        margin_bottom=args.margin_bottom,
        font_size=args.font_size,
        font_name=args.font_name,
        spacing=args.spacing,
        show_progress=True
    )

if __name__ == "__main__":
    main()
