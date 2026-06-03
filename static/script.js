let mode = 'range';
let previewType = 'svg';
let position = 'bottom-right';
let showSerialText = true;
let pdfDebounceTimer = null;

const prefixInput = document.getElementById('prefix');
const previewSerialInput = document.getElementById('preview-serial');
const startInput = document.getElementById('start');
const endInput = document.getElementById('end');
const customListInput = document.getElementById('custom_list');

const fontSelect = document.getElementById('font_name');
const fontSizeInput = document.getElementById('font_size');
const spacingInput = document.getElementById('spacing');

const controls = [
    { slider: 'margin_right', num: 'margin_right_num', badge: 'margin_right_val', suffix: 'pt', mmFactor: 0.3527 },
    { slider: 'margin_bottom', num: 'margin_bottom_num', badge: 'margin_bottom_val', suffix: 'pt', mmFactor: 0.3527 },
    { slider: 'bar_height', num: 'bar_height_num', badge: 'bar_height_val', suffix: 'pt', mmFactor: 0.3527 },
    { slider: 'bar_width', num: 'bar_width_num', badge: 'bar_width_val', suffix: 'pt', mmFactor: null }
];

document.addEventListener('DOMContentLoaded', () => {
    controls.forEach(ctrl => {
        const sliderEl = document.getElementById(ctrl.slider);
        const numEl = document.getElementById(ctrl.num);
        
        sliderEl.addEventListener('input', (e) => {
            numEl.value = e.target.value;
            updateControlValues();
        });
        
        numEl.addEventListener('input', (e) => {
            sliderEl.value = e.target.value;
            updateControlValues();
        });
    });

    [prefixInput, previewSerialInput, startInput, endInput, customListInput, fontSelect, fontSizeInput, spacingInput]
        .forEach(el => {
            el.addEventListener('input', () => {
                updateStats();
                triggerPreviewUpdate();
            });
        });

    prefixInput.addEventListener('input', updateSampleSerial);
    startInput.addEventListener('input', updateSampleSerial);

    const serialCheckbox = document.getElementById('show_serial_text');
    if (serialCheckbox) {
        showSerialText = serialCheckbox.checked;
        serialCheckbox.addEventListener('change', () => {
            showSerialText = serialCheckbox.checked;
            triggerPreviewUpdate();
        });
    }

    ['bottom-right', 'bottom-left', 'top-right', 'top-left'].forEach(corner => {
        document.getElementById(`pos-${corner}`).addEventListener('click', () => setPosition(corner));
    });

    updateSampleSerial();
    updateStats();
    updateCornerIndicator();
    updateInstantPreview();
});

function updateSampleSerial() {
    if (mode === 'range') {
        const prefix = prefixInput.value || 'A';
        const start = startInput.value || '80';
        previewSerialInput.value = `${prefix}${start}`;
    }
}

function updateControlValues() {
    controls.forEach(ctrl => {
        const val = parseFloat(document.getElementById(ctrl.slider).value);
        const badge = document.getElementById(ctrl.badge);
        if (ctrl.mmFactor) {
            const mm = (val * ctrl.mmFactor).toFixed(1);
            badge.textContent = `${val} ${ctrl.suffix} (${mm} mm)`;
        } else {
            badge.textContent = `${val} ${ctrl.suffix}`;
        }
    });
    updateStats();
    triggerPreviewUpdate();
}

function setMode(newMode) {
    mode = newMode;
    document.getElementById('tab-range').classList.toggle('active', mode === 'range');
    document.getElementById('tab-custom').classList.toggle('active', mode === 'custom');
    
    document.getElementById('range-inputs').style.display = mode === 'range' ? 'block' : 'none';
    document.getElementById('custom-inputs').style.display = mode === 'custom' ? 'block' : 'none';
    
    if (mode === 'custom') {
        const list = customListInput.value.split(',').map(s => s.trim()).filter(Boolean);
        previewSerialInput.value = list[0] || 'A80';
    } else {
        updateSampleSerial();
    }
    
    updateStats();
    triggerPreviewUpdate();
}

function setPosition(newPosition) {
    position = newPosition;
    ['bottom-right', 'bottom-left', 'top-right', 'top-left'].forEach(corner => {
        document.getElementById(`pos-${corner}`).classList.toggle('active', position === corner);
    });
    updateCornerIndicator();
    updateStats();
    triggerPreviewUpdate();
}

function updateCornerIndicator() {
    const indicator = document.querySelector('.zoom-corner-indicator');
    if (!indicator) return;
    indicator.className = `zoom-corner-indicator ${position}`;
    const label = indicator.querySelector('.indicator-label');
    if (label) {
        label.textContent = `${position.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} Corner Focus`;
    }
}

function setPreviewType(type) {
    previewType = type;
    document.getElementById('toggle-svg').classList.toggle('active', previewType === 'svg');
    document.getElementById('toggle-pdf').classList.toggle('active', previewType === 'pdf');
    
    document.getElementById('svg-preview-page').style.display = previewType === 'svg' ? 'block' : 'none';
    document.getElementById('pdf-preview-frame').style.display = previewType === 'pdf' ? 'block' : 'none';
    
    if (previewType === 'pdf') {
        updatePdfPreview();
    } else {
        updateInstantPreview();
    }
}

function updateStats() {
    let total = 0;
    let startPage = '-';
    let endPage = '-';
    
    if (mode === 'range') {
        const prefix = prefixInput.value || 'A';
        const startValue = startInput.value.trim() || '0';
        const endValue = endInput.value.trim() || '0';
        const start = parseInt(startValue, 10);
        const end = parseInt(endValue, 10);
        if (!Number.isNaN(start) && !Number.isNaN(end) && end >= start) {
            total = end - start + 1;
            startPage = `${prefix}${startValue}`;
            endPage = `${prefix}${endValue}`;
        }
    } else {
        const list = customListInput.value.split(',').map(s => s.trim()).filter(Boolean);
        total = list.length;
        startPage = list[0] || '-';
        endPage = list[list.length - 1] || '-';
    }
    
    document.getElementById('stat-total-pages').textContent = total;
    document.getElementById('stat-start-page').textContent = startPage;
    document.getElementById('stat-end-page').textContent = endPage;
}

function triggerPreviewUpdate() {
    updateInstantPreview();
    
    if (previewType === 'pdf') {
        if (pdfDebounceTimer) clearTimeout(pdfDebounceTimer);
        pdfDebounceTimer = setTimeout(updatePdfPreview, 400);
    }
}

function updateInstantPreview() {
    const serial = previewSerialInput.value || 'A80';
    const barWidth = parseFloat(document.getElementById('bar_width').value) || 1.2;
    const barHeight = parseFloat(document.getElementById('bar_height').value) || 30.0;
    const marginRight = parseFloat(document.getElementById('margin_right').value) || 54.0;
    const marginBottom = parseFloat(document.getElementById('margin_bottom').value) || 54.0;
    
    const fontName = fontSelect.value;
    const fontSize = parseFloat(fontSizeInput.value) || 14.0;
    const spacing = parseFloat(spacingInput.value) || 15.0;
    
    const svgCanvas = document.getElementById('svg-canvas');
    svgCanvas.innerHTML = '';
    
    const barcodeSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    barcodeSvg.setAttribute('id', 'barcode-svg');
    svgCanvas.appendChild(barcodeSvg);
    
    let fontFamily = 'sans-serif';
    let fontWeight = 'bold';
    if (fontName.includes('Helvetica')) {
        fontFamily = 'Arial, sans-serif';
        fontWeight = fontName.includes('Bold') ? 'bold' : 'normal';
    } else if (fontName.includes('Times')) {
        fontFamily = 'Georgia, serif';
        fontWeight = fontName.includes('Bold') ? 'bold' : 'normal';
    } else if (fontName.includes('Courier')) {
        fontFamily = 'Courier New, monospace';
        fontWeight = fontName.includes('Bold') ? 'bold' : 'normal';
    }

    try {
        JsBarcode(barcodeSvg, serial, {
            format: 'CODE128',
            width: barWidth,
            height: barHeight,
            displayValue: false,
            margin: 0,
            background: 'transparent',
            lineColor: '#000000'
        });
        
        const barcodeWidth = parseFloat(barcodeSvg.getAttribute('width')) || 80.0;
        const xBarcode = position.endsWith('right') ? 595.27 - marginRight - barcodeWidth : marginRight;
        const yBarcode = position.startsWith('bottom') ? 841.89 - marginBottom - barHeight : marginBottom;
        
        barcodeSvg.setAttribute('x', xBarcode);
        barcodeSvg.setAttribute('y', yBarcode);
        
        if (showSerialText) {
            const xText = position.endsWith('right') ? xBarcode - spacing : xBarcode + barcodeWidth + spacing;
            const yText = yBarcode + barHeight / 2;
            const textElement = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            textElement.setAttribute('x', xText);
            textElement.setAttribute('y', yText);
            textElement.setAttribute('font-family', fontFamily);
            textElement.setAttribute('font-size', fontSize);
            textElement.setAttribute('font-weight', fontWeight);
            textElement.setAttribute('fill', '#000000');
            textElement.setAttribute('dominant-baseline', 'central');
            if (position.endsWith('right')) {
                textElement.setAttribute('text-anchor', 'end');
            } else {
                textElement.setAttribute('text-anchor', 'start');
            }
            textElement.textContent = serial;
            svgCanvas.appendChild(textElement);
        }
    } catch (err) {
        console.error('JsBarcode drawing error:', err);
    }
}

function updatePdfPreview() {
    const serial = previewSerialInput.value || 'A80';
    const barWidth = parseFloat(document.getElementById('bar_width').value) || 1.2;
    const barHeight = parseFloat(document.getElementById('bar_height').value) || 30.0;
    const marginRight = parseFloat(document.getElementById('margin_right').value) || 54.0;
    const marginBottom = parseFloat(document.getElementById('margin_bottom').value) || 54.0;
    
    const fontName = fontSelect.value;
    const fontSize = parseFloat(fontSizeInput.value) || 14.0;
    const spacing = parseFloat(spacingInput.value) || 15.0;
    
    const url = `/api/preview?serial=${encodeURIComponent(serial)}&bar_width=${barWidth}&bar_height=${barHeight}&margin_right=${marginRight}&margin_bottom=${marginBottom}&font_size=${fontSize}&font_name=${encodeURIComponent(fontName)}&spacing=${spacing}&position=${encodeURIComponent(position)}&show_serial_text=${showSerialText}&t=${Date.now()}`;
    
    document.getElementById('pdf-preview-frame').src = url;
}

async function downloadPDF() {
    const btn = document.getElementById('download-btn');
    const spinner = document.getElementById('btn-spinner');
    const icon = document.getElementById('btn-icon');
    
    btn.classList.add('btn-loading');
    spinner.style.display = 'block';
    icon.style.display = 'none';
    
    const payload = {
        mode: mode,
        bar_width: parseFloat(document.getElementById('bar_width').value),
        bar_height: parseFloat(document.getElementById('bar_height').value),
        margin_right: parseFloat(document.getElementById('margin_right').value),
        margin_bottom: parseFloat(document.getElementById('margin_bottom').value),
        font_size: parseFloat(fontSizeInput.value),
        font_name: fontSelect.value,
        spacing: parseFloat(spacingInput.value),
        position: position,
        show_serial_text: showSerialText
    };
    
    if (mode === 'range') {
        payload.prefix = prefixInput.value || 'A';
        payload.start = startInput.value || '1';
        payload.end = endInput.value || '20';
    } else {
        payload.custom_list = customListInput.value;
    }
    
    try {
        const response = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error || 'Failed to generate PDF');
        }
        
        let filename = 'barcoded_output.pdf';
        const disposition = response.headers.get('Content-Disposition');
        if (disposition && disposition.indexOf('attachment') !== -1) {
            const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
            const matches = filenameRegex.exec(disposition);
            if (matches != null && matches[1]) { 
                filename = matches[1].replace(/["]/g, '');
            }
        }
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        
    } catch (err) {
        alert('Error generating PDF: ' + err.message);
    } finally {
        btn.classList.remove('btn-loading');
        spinner.style.display = 'none';
        icon.style.display = 'block';
    }
}
