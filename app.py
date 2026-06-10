import io
import os
import re
import uuid
import time
import threading
import tempfile
import zipfile
from concurrent.futures import ProcessPoolExecutor
from multiprocessing import Manager
from pypdf import PdfWriter
from flask import Flask, request, send_file, render_template, jsonify
from generator import generate_pdf, _build_a3_pairs

app = Flask(__name__, template_folder='templates', static_folder='static')

JOBS = {}
JOBS_LOCK = threading.Lock()
TEMP_DIR = tempfile.gettempdir()
JOB_TTL_SECONDS = 3600


def _generate_chunk_worker(output_path, serials, params, chunk_idx, progress_dict):
    def cb(done, total):
        progress_dict[str(chunk_idx)] = done
        
    try:
        generate_pdf(
            output_path=output_path,
            serials=serials,
            bar_width=params['bar_width'],
            bar_height=params['bar_height'],
            margin_right=params['margin_right'],
            margin_bottom=params['margin_bottom'],
            font_size=params['font_size'],
            font_name=params['font_name'],
            spacing=params['spacing'],
            position=params['position'],
            show_serial_text=params['show_serial_text'],
            show_progress=False,
            page_layout=params['page_layout'],
            progress_callback=cb
        )
    except Exception as e:
        progress_dict[f"error_{chunk_idx}"] = str(e)
        raise e


def _cleanup_old_jobs():
    now = time.time()
    with JOBS_LOCK:
        dead = [jid for jid, j in JOBS.items() if now - j['created_at'] > JOB_TTL_SECONDS]
        for jid in dead:
            path = JOBS[jid].get('file_path')
            if path and os.path.exists(path):
                try:
                    os.remove(path)
                except OSError:
                    pass
            del JOBS[jid]


def _run_generation(job_id, file_path, serials, params, chunk_size, should_zip):
    temp_paths = []
    try:
        with JOBS_LOCK:
            JOBS[job_id]['status'] = 'running'

        page_layout = params['page_layout']
        serials_per_chunk = chunk_size * 2 if page_layout == 'a3' else chunk_size
        chunks = [serials[i:i + serials_per_chunk] for i in range(0, len(serials), serials_per_chunk)]
        num_chunks = len(chunks)

        for i in range(num_chunks):
            temp_paths.append(os.path.join(TEMP_DIR, f"barcode_chunk_{job_id}_{i}.pdf"))

        with Manager() as manager:
            progress_dict = manager.dict()
            for i in range(num_chunks):
                progress_dict[str(i)] = 0

            max_workers = min(num_chunks, os.cpu_count() or 4)

            with ProcessPoolExecutor(max_workers=max_workers) as executor:
                futures = []
                for i, chunk_serials in enumerate(chunks):
                    futures.append(executor.submit(
                        _generate_chunk_worker,
                        temp_paths[i],
                        chunk_serials,
                        params,
                        i,
                        progress_dict
                    ))

                # Poll and update progress in the JOBS dict
                while not all(f.done() for f in futures):
                    # Check if any workers raised errors
                    for i in range(num_chunks):
                        err_key = f"error_{i}"
                        if err_key in progress_dict:
                            raise Exception(f"Worker {i} failed: {progress_dict[err_key]}")

                    total_done = sum(progress_dict.get(str(i), 0) for i in range(num_chunks))
                    with JOBS_LOCK:
                        if job_id in JOBS:
                            JOBS[job_id]['progress'] = total_done
                    time.sleep(0.5)

                # Raise any worker exception if it happened
                for f in futures:
                    f.result()

        # All chunks are generated successfully!
        with JOBS_LOCK:
            if job_id in JOBS:
                JOBS[job_id]['progress'] = JOBS[job_id]['total']
                JOBS[job_id]['status'] = 'compiling'

        if should_zip:
            # Package into ZIP archive
            with zipfile.ZipFile(file_path, 'w', zipfile.ZIP_DEFLATED) as zip_file:
                for i, temp_path in enumerate(temp_paths):
                    chunk_serials = chunks[i]
                    layout_tag = 'a3' if page_layout == 'a3' else 'a4'
                    chunk_filename = f"part_{i+1}_{layout_tag}_{chunk_serials[0]}_to_{chunk_serials[-1]}.pdf"
                    zip_file.write(temp_path, arcname=chunk_filename)
        else:
            # Merge into a single PDF
            if num_chunks == 1:
                if os.path.exists(file_path):
                    os.remove(file_path)
                os.rename(temp_paths[0], file_path)
            else:
                writer = PdfWriter()
                for temp_path in temp_paths:
                    writer.append(temp_path)
                with open(file_path, "wb") as f:
                    writer.write(f)
                writer.close()

        # Clean up temp files
        for temp_path in temp_paths:
            if os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except OSError:
                    pass

        with JOBS_LOCK:
            if job_id in JOBS:
                JOBS[job_id]['status'] = 'done'

    except Exception as e:
        # Clean up all temp files and output on error
        for temp_path in temp_paths:
            if os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except OSError:
                    pass
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
            except OSError:
                pass
        with JOBS_LOCK:
            if job_id in JOBS:
                JOBS[job_id]['status'] = 'error'
                JOBS[job_id]['error'] = str(e)


def _parse_serials(data):
    mode = data.get('mode', 'range')
    serials = []

    if mode == 'range':
        prefix = data.get('prefix', 'A')
        start = str(data.get('start', '1'))
        end = str(data.get('end', '20'))
        if not re.fullmatch(r'\d+', start) or not re.fullmatch(r'\d+', end):
            raise ValueError('Start and End must be numeric values.')
        start_int = int(start)
        end_int = int(end)
        if start_int > end_int:
            raise ValueError('Start number must be less than or equal to End number.')
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
            raise ValueError('Custom serial list cannot be empty.')

    return serials


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

        return send_file(pdf_buffer, mimetype='application/pdf', as_attachment=False)
    except Exception as e:
        return jsonify({'error': str(e)}), 400


@app.route('/api/generate', methods=['POST'])
def start_generate():
    _cleanup_old_jobs()
    try:
        data = request.json or {}
        serials = _parse_serials(data)

        page_layout = data.get('page_layout', 'a4')
        chunk_size = int(data.get('chunk_size', 50000))
        download_format = data.get('download_format', 'auto')

        total_sheets = len(_build_a3_pairs(serials)) if page_layout == 'a3' else len(serials)

        if download_format == 'zip':
            should_zip = True
        elif download_format == 'pdf':
            should_zip = False
        else: # 'auto'
            should_zip = (total_sheets > chunk_size)

        layout_tag = 'a3' if page_layout == 'a3' else 'a4'
        ext = 'zip' if should_zip else 'pdf'
        filename = f"barcoded_{layout_tag}_{serials[0]}_to_{serials[-1]}.{ext}" if len(serials) > 1 else f"barcoded_{layout_tag}_{serials[0]}.{ext}"

        params = {
            'bar_width': float(data.get('bar_width', 1.2)),
            'bar_height': float(data.get('bar_height', 30.0)),
            'margin_right': float(data.get('margin_right', 54.0)),
            'margin_bottom': float(data.get('margin_bottom', 54.0)),
            'font_size': float(data.get('font_size', 14.0)),
            'font_name': data.get('font_name', 'Helvetica-Bold'),
            'spacing': float(data.get('spacing', 15.0)),
            'position': data.get('position', 'bottom-right'),
            'show_serial_text': bool(data.get('show_serial_text', True)),
            'page_layout': page_layout,
        }

        job_id = str(uuid.uuid4())
        file_path = os.path.join(TEMP_DIR, f"barcode_job_{job_id}.{ext}")

        with JOBS_LOCK:
            JOBS[job_id] = {
                'status': 'queued',
                'progress': 0,
                'total': total_sheets,
                'file_path': file_path,
                'filename': filename,
                'created_at': time.time(),
                'error': None,
            }

        t = threading.Thread(
            target=_run_generation,
            args=(job_id, file_path, serials, params, chunk_size, should_zip),
            daemon=True
        )
        t.start()

        return jsonify({'job_id': job_id, 'total': total_sheets})

    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        return jsonify({'error': str(e)}), 400


@app.route('/api/status/<job_id>', methods=['GET'])
def job_status(job_id):
    with JOBS_LOCK:
        job = JOBS.get(job_id)
    if not job:
        return jsonify({'error': 'Job not found'}), 404
    return jsonify({
        'status': job['status'],
        'progress': job['progress'],
        'total': job['total'],
        'error': job['error'],
    })


@app.route('/api/download/<job_id>', methods=['GET'])
def download_job(job_id):
    with JOBS_LOCK:
        job = JOBS.get(job_id)
    if not job:
        return jsonify({'error': 'Job not found'}), 404
    if job['status'] != 'done':
        return jsonify({'error': 'Job not ready'}), 400
    file_path = job['file_path']
    filename = job['filename']
    if not os.path.exists(file_path):
        return jsonify({'error': 'File missing on server'}), 500

    def stream_and_cleanup():
        try:
            with open(file_path, 'rb') as f:
                while True:
                    chunk = f.read(65536)
                    if not chunk:
                        break
                    yield chunk
        finally:
            try:
                os.remove(file_path)
            except OSError:
                pass
            with JOBS_LOCK:
                JOBS.pop(job_id, None)

    from flask import Response
    mimetype = 'application/zip' if filename.lower().endswith('.zip') else 'application/pdf'
    headers = {
        'Content-Disposition': f'attachment; filename="{filename}"',
        'Content-Type': mimetype,
    }
    file_size = os.path.getsize(file_path)
    headers['Content-Length'] = str(file_size)
    return Response(stream_and_cleanup(), headers=headers)


if __name__ == '__main__':
    print("Starting PDF Barcode Generator web server at http://127.0.0.1:5000")
    app.run(host='127.0.0.1', port=5000, debug=True)