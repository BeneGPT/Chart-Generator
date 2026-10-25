const DEFAULT_COLORS = [
    '#ff6384',
    '#36a2eb',
    '#ffce56',
    '#4bc0c0',
    '#9966ff',
    '#ff9f40'
];

// Each entry: { label, value, color }
let entries = [];

const settings = {
    type: 'bar',
    title: '',
    unit: '',
    xAxis: '',
    yAxis: '',
    source: '',
    sourceUrl: ''
};

let myChart = null;

const FONT = 'Inter';
Chart.defaults.font.family = `'${FONT}', sans-serif`;

// Text and grid colors for the chart. Exports always use the light set, since they have a white background.
const CHART_THEMES = {
    light: { text: '#1d1d1f', grid: 'rgba(29, 29, 31, 0.1)' },
    dark: { text: '#f5f5f7', grid: 'rgba(245, 245, 247, 0.14)' }
};

const THEME_KEY = 'chart-generator-theme';
const systemDark = window.matchMedia('(prefers-color-scheme: dark)');

// 'system', 'light' or 'dark'. Only an explicit choice is remembered.
function storedTheme() {
    try {
        const value = localStorage.getItem(THEME_KEY);
        return value === 'light' || value === 'dark' ? value : 'system';
    } catch (error) {
        return 'system';
    }
}

function activeTheme() {
    const choice = storedTheme();
    if (choice !== 'system') {
        return choice;
    }
    return systemDark.matches ? 'dark' : 'light';
}

function applyTheme(choice) {
    try {
        if (choice === 'system') {
            localStorage.removeItem(THEME_KEY);
        } else {
            localStorage.setItem(THEME_KEY, choice);
        }
    } catch (error) {
        // Storage can be blocked (private mode); the choice then lasts until reload.
    }
    if (choice === 'system') {
        delete document.documentElement.dataset.theme;
    } else {
        document.documentElement.dataset.theme = choice;
    }
    document.querySelectorAll('[data-theme-choice]').forEach((button) => {
        button.setAttribute('aria-pressed', String(button.dataset.themeChoice === choice));
    });
    if (myChart) {
        renderChart();
    }
}

const hasAxes = () => settings.type === 'bar' || settings.type === 'line';

function withUnit(value) {
    return settings.unit ? `${value} ${settings.unit}` : `${value}`;
}

// Turns what the user typed into a safe http(s) link, or '' if it isn't one.
function normalizeUrl(raw) {
    const value = raw.trim();
    if (!value) {
        return '';
    }
    try {
        const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`);
        return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '';
    } catch (error) {
        return '';
    }
}

function sourceText() {
    const label = settings.source.trim();
    const url = normalizeUrl(settings.sourceUrl);
    if (!label && !url) {
        return '';
    }
    return label || url;
}

function renderSource() {
    const el = document.getElementById('sourceLine');
    if (!el) {
        return;
    }
    const text = sourceText();
    const url = normalizeUrl(settings.sourceUrl);
    el.textContent = '';
    el.hidden = !text;
    if (!text) {
        return;
    }
    el.append('Source: ');
    if (url) {
        const link = document.createElement('a');
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener';
        link.textContent = text;
        el.append(link);
    } else {
        el.append(text);
    }
}

function hexToRgba(hex, alpha) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function nextDefaultColor() {
    return DEFAULT_COLORS[entries.length % DEFAULT_COLORS.length];
}

function buildDataset() {
    const colors = entries.map((e) => e.color);
    const lineLike = settings.type === 'line' || settings.type === 'radar';
    const lineColor = colors[0] || DEFAULT_COLORS[1];

    return {
        label: settings.yAxis || settings.title || 'Value',
        data: entries.map((e) => e.value),
        backgroundColor: lineLike ? hexToRgba(lineColor, 0.2) : colors,
        borderColor: lineLike ? lineColor : colors,
        pointBackgroundColor: colors,
        borderWidth: lineLike ? 2 : 1,
        fill: settings.type === 'radar'
    };
}

function buildOptions(palette = CHART_THEMES[activeTheme()]) {
    const options = {
        responsive: true,
        maintainAspectRatio: false,
        color: palette.text,
        borderColor: palette.grid,
        plugins: {
            title: {
                display: Boolean(settings.title),
                text: settings.title,
                color: palette.text,
                font: { size: 20, weight: '600' }
            },
            legend: {
                display: settings.type === 'pie' || settings.type === 'doughnut',
                labels: { color: palette.text }
            },
            tooltip: {
                callbacks: {
                    label: (ctx) => {
                        const value = ctx.parsed && typeof ctx.parsed === 'object' ? (ctx.parsed.y ?? ctx.parsed.r) : ctx.parsed;
                        return withUnit(value);
                    }
                }
            }
        },
        interaction: interactionFor(settings.type),
        onClick: (event, activeElements) => {
            if (activeElements.length > 0) {
                removeData(activeElements[0].index);
            }
        }
    };

    if (hasAxes()) {
        options.scales = {
            x: {
                title: { display: Boolean(settings.xAxis), text: settings.xAxis, color: palette.text, font: { size: 14 } },
                ticks: { color: palette.text },
                grid: { color: palette.grid },
                border: { color: palette.grid }
            },
            y: {
                beginAtZero: true,
                title: { display: Boolean(settings.yAxis), text: settings.yAxis, color: palette.text, font: { size: 14 } },
                ticks: { color: palette.text, callback: (value) => withUnit(value) },
                grid: { color: palette.grid },
                border: { color: palette.grid }
            }
        };
    } else if (settings.type === 'radar') {
        options.scales = {
            r: {
                beginAtZero: true,
                ticks: { color: palette.text, backdropColor: 'transparent', callback: (value) => withUnit(value) },
                grid: { color: palette.grid },
                angleLines: { color: palette.grid },
                pointLabels: { color: palette.text }
            }
        };
    }

    return options;
}

// Pie and doughnut need a click on a slice, not the nearest index.
function interactionFor(type) {
    return type === 'pie' || type === 'doughnut' ? { mode: 'nearest', intersect: true } : { mode: 'index', intersect: false };
}

function createChart() {
    const ctx = document.getElementById('myChart').getContext('2d');
    return new Chart(ctx, {
        type: settings.type,
        data: {
            labels: entries.map((e) => e.label),
            datasets: [buildDataset()]
        },
        options: buildOptions()
    });
}

function renderChart() {
    if (myChart) {
        myChart.destroy();
    }
    myChart = createChart();
}

function render() {
    renderChart();
    renderDataList();
    document.querySelectorAll('.axis-field').forEach((el) => {
        el.classList.toggle('is-hidden', !hasAxes());
    });
}

function renderDataList() {
    const list = document.getElementById('dataList');
    list.innerHTML = '';
    document.getElementById('emptyHint').style.display = entries.length ? 'none' : 'block';

    entries.forEach((entry, index) => {
        const li = document.createElement('li');

        const label = document.createElement('input');
        label.type = 'text';
        label.className = 'input';
        label.value = entry.label;
        label.addEventListener('change', () => {
            entry.label = label.value;
            renderChart();
        });

        const value = document.createElement('input');
        value.type = 'number';
        value.step = 'any';
        value.className = 'input value';
        value.value = entry.value;
        value.addEventListener('change', () => {
            const parsed = parseFloat(value.value);
            if (!Number.isNaN(parsed)) {
                entry.value = parsed;
                renderChart();
            }
        });

        const color = document.createElement('input');
        color.type = 'color';
        color.className = 'color';
        color.title = 'Color';
        color.value = entry.color;
        color.addEventListener('input', () => {
            entry.color = color.value;
            renderChart();
        });

        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'remove';
        remove.title = 'Remove';
        remove.textContent = '×';
        remove.addEventListener('click', () => removeData(index));

        li.append(label, value, color, remove);
        list.appendChild(li);
    });
}

function addData(event) {
    event.preventDefault();
    const labelInput = document.getElementById('labelInput');
    const dataInput = document.getElementById('dataInput');
    const colorInput = document.getElementById('colorInput');
    const value = parseFloat(dataInput.value);

    if (labelInput.value && !Number.isNaN(value)) {
        entries.push({ label: labelInput.value, value: value, color: colorInput.value });
        labelInput.value = '';
        dataInput.value = '';
        colorInput.value = nextDefaultColor();
        render();
        labelInput.focus();
    }
}

function removeData(index) {
    if (index < entries.length) {
        entries.splice(index, 1);
        render();
    }
}

function fileName(extension) {
    const base = (settings.title || 'chart').trim().replace(/[^\w\-äöüÄÖÜß ]+/g, '').replace(/\s+/g, '_') || 'chart';
    return `${base}.${extension}`;
}

// PowerPoint number format that appends the unit, e.g. General" kg"
function pptxFormatCode() {
    if (!settings.unit) {
        return 'General';
    }
    return `General" ${settings.unit.replace(/"/g, '')}"`;
}

function downloadPptx() {
    if (!entries.length) {
        alert('Add some data first.');
        return;
    }

    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_WIDE';
    const slide = pptx.addSlide();

    const typeMap = {
        bar: pptx.ChartType.bar,
        line: pptx.ChartType.line,
        pie: pptx.ChartType.pie,
        doughnut: pptx.ChartType.doughnut,
        radar: pptx.ChartType.radar
    };

    const data = [{
        name: settings.yAxis || settings.title || 'Value',
        labels: entries.map((e) => e.label),
        values: entries.map((e) => e.value)
    }];

    const colors = entries.map((e) => e.color.replace('#', ''));
    const isPie = settings.type === 'pie' || settings.type === 'doughnut';

    const options = {
        x: 0.5,
        y: 0.4,
        w: 12.33,
        h: sourceText() ? 6.2 : 6.7,
        chartColors: settings.type === 'line' || settings.type === 'radar' ? [colors[0]] : colors,
        showTitle: Boolean(settings.title),
        title: settings.title,
        titleFontSize: 20,
        showLegend: isPie,
        legendPos: 'r',
        titleFontFace: FONT,
        legendFontFace: FONT,
        catAxisLabelFontFace: FONT,
        valAxisLabelFontFace: FONT,
        catAxisTitleFontFace: FONT,
        valAxisTitleFontFace: FONT,
        dataLabelFontFace: FONT,
        valAxisLabelFormatCode: pptxFormatCode(),
        dataLabelFormatCode: pptxFormatCode()
    };

    if (settings.type === 'bar' || settings.type === 'line') {
        options.barDir = 'col';
        options.valAxisMinVal = Math.min(0, ...entries.map((e) => e.value));
        options.showCatAxisTitle = Boolean(settings.xAxis);
        options.catAxisTitle = settings.xAxis;
        options.showValAxisTitle = Boolean(settings.yAxis);
        options.valAxisTitle = settings.yAxis;
    }

    if (isPie) {
        options.showPercent = false;
        options.showValue = true;
    }

    if (settings.type === 'radar') {
        options.radarStyle = 'filled';
    }

    slide.addChart(typeMap[settings.type], data, options);

    if (sourceText()) {
        const url = normalizeUrl(settings.sourceUrl);
        slide.addText([
            { text: 'Source: ' },
            { text: sourceText(), options: url ? { hyperlink: { url: url } } : {} }
        ], {
            x: 0.5,
            y: 6.75,
            w: 12.33,
            h: 0.4,
            fontFace: FONT,
            fontSize: 11,
            color: '595959'
        });
    }
    pptx.writeFile({ fileName: fileName('pptx') });
}

function downloadPng() {
    // Re-render at 3x pixel density, with light-theme colors for the white background,
    // so the image stays sharp and readable when placed on a slide.
    // New options only take effect on update, so update before resizing to the new pixel ratio.
    myChart.options = { ...buildOptions(CHART_THEMES.light), devicePixelRatio: 3 };
    myChart.update('none');
    myChart.resize();
    myChart.update('none');

    const scale = 3;
    const source = sourceText();
    const url = normalizeUrl(settings.sourceUrl);
    // The source line names the URL too, since a link in an image can't be clicked.
    const sourceLine = source ? `Source: ${source}${url && url !== source ? ` (${url})` : ''}` : '';
    const footer = sourceLine ? 36 * scale : 0;

    const canvas = document.createElement('canvas');
    canvas.width = myChart.canvas.width;
    canvas.height = myChart.canvas.height + footer;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(myChart.canvas, 0, 0);

    if (sourceLine) {
        ctx.fillStyle = '#595959';
        ctx.font = `${12 * scale}px '${FONT}', sans-serif`;
        ctx.textBaseline = 'middle';
        ctx.fillText(sourceLine, 12 * scale, myChart.canvas.height + footer / 2, canvas.width - 24 * scale);
    }

    myChart.options = buildOptions();
    myChart.update('none');
    myChart.resize();
    myChart.update('none');

    const link = document.createElement('a');
    link.download = fileName('png');
    link.href = canvas.toDataURL('image/png');
    link.click();
}

// Binds a handler only if the element exists. If the browser still has an older index.html
// cached next to a newer script, a missing field must not stop the rest of the app from working.
function on(id, type, handler) {
    const el = document.getElementById(id);
    if (el) {
        el.addEventListener(type, handler);
    }
}

function bindSetting(id, key, afterChange) {
    on(id, 'input', (event) => {
        settings[key] = event.target.value;
        afterChange();
    });
}

bindSetting('titleInput', 'title', renderChart);
bindSetting('unitInput', 'unit', renderChart);
bindSetting('xAxisInput', 'xAxis', renderChart);
bindSetting('yAxisInput', 'yAxis', renderChart);
bindSetting('sourceInput', 'source', renderSource);
bindSetting('sourceUrlInput', 'sourceUrl', renderSource);

on('chartType', 'change', (event) => {
    settings.type = event.target.value;
    render();
});

document.querySelectorAll('[data-theme-choice]').forEach((button) => {
    button.addEventListener('click', () => applyTheme(button.dataset.themeChoice));
});
// Follow the system setting live while the user hasn't picked light or dark.
systemDark.addEventListener('change', () => {
    if (storedTheme() === 'system' && myChart) {
        renderChart();
    }
});

on('addForm', 'submit', addData);
on('pptxBtn', 'click', downloadPptx);
on('pngBtn', 'click', downloadPng);
document.getElementById('colorInput').value = nextDefaultColor();

applyTheme(storedTheme());
render();
// The web font may arrive after the first draw; redraw so the chart picks it up.
document.fonts.ready.then(renderChart);
