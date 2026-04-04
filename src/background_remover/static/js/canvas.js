export function createCanvasStore(dom) {
    return {
        resultContext: dom.resultCanvas.getContext("2d"),
        overlayContext: dom.overlayCanvas.getContext("2d"),
        workingCanvas: document.createElement("canvas"),
        workingContext: document.createElement("canvas").getContext("2d"),
        exportCanvas: document.createElement("canvas"),
        exportContext: document.createElement("canvas").getContext("2d"),
        originalCanvas: document.createElement("canvas"),
        originalContext: document.createElement("canvas").getContext("2d"),
    };
}

export function initializeCanvasStore(store) {
    store.workingContext = store.workingCanvas.getContext("2d", {
        willReadFrequently: true,
    });
    store.exportContext = store.exportCanvas.getContext("2d");
    store.originalContext = store.originalCanvas.getContext("2d", {
        willReadFrequently: true,
    });
}

export function syncCanvasSize(canvas, context) {
    const ratio = window.devicePixelRatio || 1;
    const cssWidth = Math.max(1, Math.floor(canvas.clientWidth));
    const cssHeight = Math.max(1, Math.floor(canvas.clientHeight));
    const bitmapWidth = Math.max(1, Math.floor(cssWidth * ratio));
    const bitmapHeight = Math.max(1, Math.floor(cssHeight * ratio));

    if (canvas.width !== bitmapWidth || canvas.height !== bitmapHeight) {
        canvas.width = bitmapWidth;
        canvas.height = bitmapHeight;
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
}

export function clearCanvas(context, canvas) {
    context.clearRect(0, 0, canvas.clientWidth || 1, canvas.clientHeight || 1);
}

export function drawContained(context, canvas, source) {
    clearCanvas(context, canvas);
    if (!source) {
        return null;
    }

    const sourceWidth = source.naturalWidth || source.width;
    const sourceHeight = source.naturalHeight || source.height;
    const canvasWidth = canvas.clientWidth || 1;
    const canvasHeight = canvas.clientHeight || 1;
    const scale = Math.min(canvasWidth / sourceWidth, canvasHeight / sourceHeight);
    const drawWidth = sourceWidth * scale;
    const drawHeight = sourceHeight * scale;
    const offsetX = (canvasWidth - drawWidth) / 2;
    const offsetY = (canvasHeight - drawHeight) / 2;
    context.drawImage(source, offsetX, offsetY, drawWidth, drawHeight);
    return { x: offsetX, y: offsetY, width: drawWidth, height: drawHeight };
}

export function clearOverlay(dom, store) {
    clearCanvas(store.overlayContext, dom.overlayCanvas);
}
