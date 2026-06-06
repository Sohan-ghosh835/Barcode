let mode = 'range';
let previewType = 'svg';
let position = 'bottom-right';
let showSerialText = true;
let pdfDebounceTimer = null;
let pageLayout = 'a4';

const A4_W = 595.27;
const A4_H = 841.89;
const A3_W = 1190.55;
const A3_H = 841.89;

const prefixInput = document.getElementById('prefix');
const previewSerialInput = document.getElementById('preview-serial');
const previewSerial2Input = document.getElementById('preview-serial-2');
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

    [prefixInput, previewSerialInput, previewSerial2Input, startInput, endInput, customListInput, fontSelect, fontSizeInput, spacingInput]
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

    document.addEventListener('click', (e) => {
        const wrapper = document.getElementById('layout-dropdown-wrapper');
        if (wrapper && !wrapper.contains(e.target)) {
            closeLayoutDropdown();
        }
    });

    updateSampleSerial();
    updateStats();
    updateCornerIndicator();
    updateInstantPreview();
});

function toggleLayoutDropdown() {
    const btn = document.getElementById('layout-dropdown-btn');
    const menu = document.getElementById('layout-dropdown-menu');
    btn.classList.toggle('open');
    menu.classList.toggle('open');
}

function closeLayoutDropdown() {
    document.getElementById('layout-dropdown-btn').classList.remove('open');
    document.getElementById('layout-dropdown-menu').classList.remove('open');
}

function selectLayout(layout) {
    pageLayout = layout;
    closeLayoutDropdown();

    const btnLabel = document.getElementById('layout-btn-label');
    const optA4 = document.getElementById('layout-opt-a4');
    const optA3 = document.getElementById('layout-opt-a3');
    const a3Badge = document.getElementById('a3-badge');
    const a3Row = document.getElementById('preview-serial-a3-row');
    const downloadLabel = document.getElementById('download-btn-label');
    const headerSubtitle = document.getElementById('header-subtitle');
    const infoBox = document.getElementById('info-box-text');

    if (layout === 'a3') {
        btnLabel.textContent = 'A3 Page Layout';
        optA4.classList.remove('active');
        optA3.classList.add('active');
        a3Badge.style.display = 'inline-flex';
        a3Row.style.display = mode === 'range' ? 'block' : 'none';
        downloadLabel.textContent = 'Generate & Download A3 PDF';
        headerSubtitle.textContent = 'A3 landscape sheets · 2 barcodes per page (2-up layout)';
        infoBox.innerHTML = '💡 <strong>A3 Mode:</strong> Left half fills all sheets first (A80→A84), then right half continues (A85→A89). No consecutive serials share the same sheet. The centre divider is visual-only and does not appear in the PDF.';
    } else {
        btnLabel.textContent = 'A4 Page Layout';
        optA3.classList.remove('active');
        optA4.classList.add('active');
        a3Badge.style.display = 'none';
        a3Row.style.display = 'none';
        downloadLabel.textContent = 'Generate & Download PDF';
        headerSubtitle.textContent = 'Blank A4 pages with Code 128 barcodes and serials';
        infoBox.innerHTML = '💡 <strong>Instant Canvas</strong> runs in the browser for ultra-fast positioning with zero lag. Toggle to <strong>Exact PDF Render</strong> to verify the final vector PDF generated by ReportLab.';
    }

    rebuildPreviewContainer();
    updateStats();
    updateSampleSerial();
    triggerPreviewUpdate();
}

function rebuildPreviewContainer() {
    const svgPreviewPage = document.getElementById('svg-preview-page');

    if (pageLayout === 'a3') {
        svgPreviewPage.className = 'a3-page';
        svgPreviewPage.innerHTML = `
            <div class="a3-divider"></div>
            <div class="a3-half-label left">LEFT HALF · A4</div>
            <div class="a3-half-label right">RIGHT HALF · A4</div>
            <div class="bottom-right-container">
                <svg class="preview-svg" id="svg-canvas" viewBox="0 0 ${A3_W} ${A3_H}" xmlns="http://www.w3.org/2000/svg"></svg>
            </div>
        `;
    } else {
        svgPreviewPage.className = 'a4-page';
        svgPreviewPage.innerHTML = `
            <div class="zoom-corner-indicator bottom-right" id="zoom-corner-indicator">
                <span class="indicator-label">Bottom Right Corner Focus</span>
            </div>
            <div class="bottom-right-container">
                <svg class="preview-svg" id="svg-canvas" viewBox="0 0 ${A4_W} ${A4_H}" xmlns="http://www.w3.org/2000/svg"></svg>
            </div>
        `;
        updateCornerIndicator();
    }
}

function updateSampleSerial() {
    if (mode === 'range') {
        const prefix = prefixInput.value || 'A';
        const start = startInput.value || '80';
        const startNum = parseInt(start, 10);
        previewSerialInput.value = `${prefix}${start}`;
        if (pageLayout === 'a3') {
            const endVal = endInput.value.trim() || '80';
            const endNum = parseInt(endVal, 10);
            const total = (!isNaN(startNum) && !isNaN(endNum) && endNum >= startNum) ? (endNum - startNum + 1) : 2;
            const half = Math.ceil(total / 2);
            const rightStartNum = startNum + half;
            previewSerial2Input.value = `${prefix}${rightStartNum}`;
        }
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

    const a3Row = document.getElementById('preview-serial-a3-row');
    if (a3Row) {
        a3Row.style.display = (pageLayout === 'a3' && mode === 'range') ? 'block' : 'none';
    }

    if (mode === 'custom') {
        const list = customListInput.value.split(',').map(s => s.trim()).filter(Boolean);
        previewSerialInput.value = list[0] || 'A80';
        if (pageLayout === 'a3') {
            const half = Math.ceil(list.length / 2);
            previewSerial2Input.value = list[half] || list[1] || 'A81';
        }
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
    if (pageLayout === 'a3') return;
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

    const svgPage = document.getElementById('svg-preview-page');
    const pdfFrame = document.getElementById('pdf-preview-frame');

    svgPage.style.display = previewType === 'svg' ? 'block' : 'none';
    pdfFrame.style.display = previewType === 'pdf' ? 'block' : 'none';

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

    const statLabel = document.querySelector('#stat-total-pages')?.closest('.stat-card')?.querySelector('.stat-label');

    if (pageLayout === 'a3') {
        const sheets = Math.ceil(total / 2);
        document.getElementById('stat-total-pages').textContent = `${total} (${sheets} sheets)`;
        if (statLabel) statLabel.textContent = 'Total Serials';
    } else {
        document.getElementById('stat-total-pages').textContent = total;
        if (statLabel) statLabel.textContent = 'Total Pages';
    }

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

function getFontStyle(fontName) {
    let fontFamily = 'Arial, sans-serif';
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
    return { fontFamily, fontWeight };
}

function drawBarcodeOnSvg(svgCanvas, serial, barWidth, barHeight, marginRight, marginBottom, fontSize, fontName, spacing, pos, pageW, pageH, xOffset) {
    const { fontFamily, fontWeight } = getFontStyle(fontName);

    const tempSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    tempSvg.style.position = 'absolute';
    tempSvg.style.left = '-9999px';
    tempSvg.style.top = '-9999px';
    document.body.appendChild(tempSvg);

    try {
        JsBarcode(tempSvg, serial, {
            format: 'CODE128',
            width: barWidth,
            height: barHeight,
            displayValue: false,
            margin: 0,
            background: 'transparent',
            lineColor: '#000000'
        });

        const barcodeW = parseFloat(tempSvg.getAttribute('width')) || 80.0;

        const xBarcode = pos.endsWith('right')
            ? (xOffset + pageW - marginRight - barcodeW)
            : (xOffset + marginRight);
        const yBarcode = pos.startsWith('bottom')
            ? (pageH - marginBottom - barHeight)
            : marginBottom;

        const wrapperG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        wrapperG.setAttribute('transform', `translate(${xBarcode}, ${yBarcode})`);

        Array.from(tempSvg.childNodes).forEach(child => {
            if (child.nodeType === 1) {
                const tag = child.tagName.toLowerCase();
                if (tag === 'g') {
                    const clonedG = child.cloneNode(true);
                    const bgRect = clonedG.querySelector('rect[width="' + barcodeW + '"]') ||
                        clonedG.querySelector('rect:first-child');
                    if (bgRect) {
                        const bgFill = bgRect.getAttribute('fill') || '';
                        if (bgFill === 'transparent' || bgFill === 'none' || bgFill === '' ||
                            bgFill.toLowerCase() === '#ffffff' || bgFill.toLowerCase() === 'white') {
                            bgRect.setAttribute('fill', 'none');
                        }
                    }
                    wrapperG.appendChild(clonedG);
                }
            }
        });

        svgCanvas.appendChild(wrapperG);

        if (showSerialText) {
            const xText = pos.endsWith('right')
                ? xBarcode - spacing
                : xBarcode + barcodeW + spacing;
            const yText = yBarcode + barHeight / 2;
            const textEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            textEl.setAttribute('x', xText);
            textEl.setAttribute('y', yText);
            textEl.setAttribute('font-family', fontFamily);
            textEl.setAttribute('font-size', fontSize);
            textEl.setAttribute('font-weight', fontWeight);
            textEl.setAttribute('fill', '#000000');
            textEl.setAttribute('dominant-baseline', 'central');
            textEl.setAttribute('text-anchor', pos.endsWith('right') ? 'end' : 'start');
            textEl.textContent = serial;
            svgCanvas.appendChild(textEl);
        }
    } catch (err) {
        console.error('JsBarcode drawing error:', err);
    }

    document.body.removeChild(tempSvg);
}

function updateInstantPreview() {
    const serial1 = previewSerialInput.value || 'A80';
    const serial2 = previewSerial2Input.value || 'A85';
    const barWidth = parseFloat(document.getElementById('bar_width').value) || 1.2;
    const barHeight = parseFloat(document.getElementById('bar_height').value) || 30.0;
    const marginRight = parseFloat(document.getElementById('margin_right').value) || 54.0;
    const marginBottom = parseFloat(document.getElementById('margin_bottom').value) || 54.0;
    const fontName = fontSelect.value;
    const fontSize = parseFloat(fontSizeInput.value) || 14.0;
    const spacing = parseFloat(spacingInput.value) || 15.0;

    const svgCanvas = document.getElementById('svg-canvas');
    if (!svgCanvas) return;
    svgCanvas.innerHTML = '';

    if (pageLayout === 'a3') {
        const halfW = A3_W / 2;

        const dividerLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        dividerLine.setAttribute('x1', halfW);
        dividerLine.setAttribute('y1', 0);
        dividerLine.setAttribute('x2', halfW);
        dividerLine.setAttribute('y2', A3_H);
        dividerLine.setAttribute('stroke', '#cccccc');
        dividerLine.setAttribute('stroke-width', '2');
        dividerLine.setAttribute('stroke-dasharray', '6,4');
        svgCanvas.appendChild(dividerLine);

        drawBarcodeOnSvg(svgCanvas, serial1, barWidth, barHeight, marginRight, marginBottom, fontSize, fontName, spacing, position, halfW, A3_H, 0);
        drawBarcodeOnSvg(svgCanvas, serial2, barWidth, barHeight, marginRight, marginBottom, fontSize, fontName, spacing, position, halfW, A3_H, halfW);
    } else {
        drawBarcodeOnSvg(svgCanvas, serial1, barWidth, barHeight, marginRight, marginBottom, fontSize, fontName, spacing, position, A4_W, A4_H, 0);

        const indicator = document.getElementById('zoom-corner-indicator');
        if (indicator) {
            indicator.className = `zoom-corner-indicator ${position}`;
            const label = indicator.querySelector('.indicator-label');
            if (label) label.textContent = `${position.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} Corner Focus`;
        }
    }
}

function updatePdfPreview() {
    const serial = previewSerialInput.value || 'A80';
    const serial2 = previewSerial2Input.value || 'A85';
    const barWidth = parseFloat(document.getElementById('bar_width').value) || 1.2;
    const barHeight = parseFloat(document.getElementById('bar_height').value) || 30.0;
    const marginRight = parseFloat(document.getElementById('margin_right').value) || 54.0;
    const marginBottom = parseFloat(document.getElementById('margin_bottom').value) || 54.0;
    const fontName = fontSelect.value;
    const fontSize = parseFloat(fontSizeInput.value) || 14.0;
    const spacing = parseFloat(spacingInput.value) || 15.0;

    let url = `/api/preview?serial=${encodeURIComponent(serial)}&bar_width=${barWidth}&bar_height=${barHeight}&margin_right=${marginRight}&margin_bottom=${marginBottom}&font_size=${fontSize}&font_name=${encodeURIComponent(fontName)}&spacing=${spacing}&position=${encodeURIComponent(position)}&show_serial_text=${showSerialText}&page_layout=${pageLayout}&t=${Date.now()}`;

    if (pageLayout === 'a3') {
        url += `&serial2=${encodeURIComponent(serial2)}`;
    }

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
        show_serial_text: showSerialText,
        page_layout: pageLayout
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