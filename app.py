import io
import os
import re
import sys
from flask import Flask, request, send_file, render_template, jsonify
from generator import generate_pdf, _build_a3_pairs

app = Flask(__name__, template_folder='templates', static_folder='static')

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/preview', methods=['GET'])
def preview_pdf():
    try:
        serial = request.args.get('serial', 'A80')
        bar_width = float(request.args.get('bar_width', 1.2))
        bar_height = float(request.args.get('bar_height', 30.0))
        margin_right = float(request.args.get('margin_right', 54.0))
        margin_bottom = float(request.args.get('margin_bottom', 54.0))
        font_size = float(request.args.get('font_size', 14.0))
        font_name = request.args.get('font_name', 'Helvetica-Bold')
        spacing = float(request.args.get('spacing', 15.0))
        position = request.args.get('position', 'bottom-right')
        show_serial_text = request.args.get('show_serial_text', 'true').lower() in ['1', 'true', 'yes', 'on']
        page_layout = request.args.get('page_layout', 'a4')
        serial2 = request.args.get('serial2', None)

        if page_layout == 'a3' and serial2:
            serials = [serial, serial2]
        else:
            serials = [serial]

        pdf_buffer = io.BytesIO()
        generate_pdf(
            output_path=pdf_buffer,
            serials=serials,
            bar_width=bar_width,
            bar_height=bar_height,
            margin_right=margin_right,
            margin_bottom=margin_bottom,
            font_size=font_size,
            font_name=font_name,
            spacing=spacing,
            position=position,
            show_serial_text=show_serial_text,
            show_progress=False,
            page_layout=page_layout
        )
        pdf_buffer.seek(0)

        return send_file(
            pdf_buffer,
            mimetype='application/pdf',
            as_attachment=False
        )
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/generate', methods=['POST'])
def generate_full_pdf():
    try:
        data = request.json or {}
        mode = data.get('mode', 'range')
        page_layout = data.get('page_layout', 'a4')
        serials = []

        if mode == 'range':
            prefix = data.get('prefix', 'A')
            start = str(data.get('start', '1'))
            end = str(data.get('end', '20'))
            if not re.fullmatch(r'\d+', start) or not re.fullmatch(r'\d+', end):
                return jsonify({'error': 'Start and End must be numeric values.'}), 400
            start_int = int(start)
            end_int = int(end)
            if start_int > end_int:
                return jsonify({'error': 'Start number must be less than or equal to End number.'}), 400
            preserve_width = (len(start) > 1 and start.startswith('0')) or (len(end) > 1 and end.startswith('0'))
            width = max(len(start), len(end)) if preserve_width else None
            if width:
                serials = [f"{prefix}{str(num).zfill(width)}" for num in range(start_int, end_int + 1)]
            else:
                serials = [f"{prefix}{num}" for num in range(start_int, end_int + 1)]
        else:
            custom_input = data.get('custom_list', '')
            serials = [s.strip() for s in custom_input.split(',') if s.strip()]
            if not serials:
                return jsonify({'error': 'Custom serial list cannot be empty.'}), 400

        bar_width = float(data.get('bar_width', 1.2))
        bar_height = float(data.get('bar_height', 30.0))
        margin_right = float(data.get('margin_right', 54.0))
        margin_bottom = float(data.get('margin_bottom', 54.0))
        font_size = float(data.get('font_size', 14.0))
        font_name = data.get('font_name', 'Helvetica-Bold')
        spacing = float(data.get('spacing', 15.0))
        position = data.get('position', 'bottom-right')
        show_serial_text = bool(data.get('show_serial_text', True))

        pdf_buffer = io.BytesIO()
        generate_pdf(
            output_path=pdf_buffer,
            serials=serials,
            bar_width=bar_width,
            bar_height=bar_height,
            margin_right=margin_right,
            margin_bottom=margin_bottom,
            font_size=font_size,
            font_name=font_name,
            spacing=spacing,
            position=position,
            show_serial_text=show_serial_text,
            show_progress=False,
            page_layout=page_layout
        )
        pdf_buffer.seek(0)

        layout_tag = 'a3' if page_layout == 'a3' else 'a4'
        filename = f"barcoded_{layout_tag}_{serials[0]}_to_{serials[-1]}.pdf" if len(serials) > 1 else f"barcoded_{layout_tag}_{serials[0]}.pdf"
        return send_file(
            pdf_buffer,
            mimetype='application/pdf',
            download_name=filename,
            as_attachment=True
        )
    except Exception as e:
        return jsonify({'error': str(e)}), 400

if __name__ == '__main__':
    print("Starting PDF Barcode Generator web server at http://127.0.0.1:5000")
    app.run(host='127.0.0.1', port=5000, debug=True)