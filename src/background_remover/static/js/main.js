import { clearOverlay, createCanvasStore, drawContained, initializeCanvasStore, syncCanvasSize } from "./canvas.js";
import { applySelection, buildSelection, paintBrush } from "./cleanup.js";
import { dom } from "./dom.js";
import { createEditorState } from "./state.js";

const state = createEditorState();
const store = createCanvasStore(dom);
initializeCanvasStore(store);

const resizeObserver = new ResizeObserver(() => {
    renderStage();
});
resizeObserver.observe(dom.compareStage);

dom.qualityRange.addEventListener("input", () => {
    dom.qualityValue.textContent = dom.qualityRange.value;
});

dom.brushSize.addEventListener("input", () => {
    dom.brushSizeValue.textContent = dom.brushSize.value;
    syncBrushCursorSize();
});

dom.wandThreshold.addEventListener("input", () => {
    dom.wandThresholdValue.textContent = dom.wandThreshold.value;
});

dom.backgroundSelect.addEventListener("change", () => {
    dom.customColorGroup.hidden = dom.backgroundSelect.value !== "custom";
    renderStage();
});

dom.formatSelect.addEventListener("change", () => {
    if (dom.formatSelect.value === "jpeg" && dom.backgroundSelect.value === "transparent") {
        dom.backgroundSelect.value = "white";
        dom.customColorGroup.hidden = true;
        setStatus("JPEG does not support transparency, so the preview background was switched to white.");
    }
    state.downloadName = createDownloadName(
        dom.fileInput.files?.[0]?.name || "image.png",
        dom.formatSelect.value,
    );
    renderStage();
});

dom.toolGroup.addEventListener("click", (event) => {
    const button = event.target.closest(".tool-button");
    if (!button) {
        return;
    }

    state.cleanupTool = button.dataset.tool;
    dom.wandToggle.classList.toggle("active", state.cleanupTool === "wand");
    dom.brushToggle.classList.toggle("active", state.cleanupTool === "brush");
    dom.wandToggle.setAttribute("aria-pressed", String(state.cleanupTool === "wand"));
    dom.brushToggle.setAttribute("aria-pressed", String(state.cleanupTool === "brush"));
    state.hoverSelection = null;
    dom.wandCursor.hidden = true;
    dom.brushCursor.hidden = true;
    clearOverlay(dom, store);
    renderStage();
});

dom.undoButton.addEventListener("click", undoCleanup);

dom.viewModeGroup.addEventListener("click", (event) => {
    const button = event.target.closest(".view-mode-button");
    if (!button) {
        return;
    }

    state.viewMode = button.dataset.view;
    dom.viewModeButtons.forEach((candidate) => {
        candidate.classList.toggle("active", candidate === button);
    });
    renderStage();
});

dom.dropzone.addEventListener("dragover", (event) => {
    event.preventDefault();
    dom.dropzone.classList.add("dragover");
});

dom.dropzone.addEventListener("dragleave", () => {
    dom.dropzone.classList.remove("dragover");
});

dom.dropzone.addEventListener("drop", (event) => {
    event.preventDefault();
    dom.dropzone.classList.remove("dragover");
    if (event.dataTransfer.files.length) {
        dom.fileInput.files = event.dataTransfer.files;
        handleFileSelection();
    }
});

dom.fileInput.addEventListener("change", handleFileSelection);

dom.downloadButton.addEventListener("click", async () => {
    if (!state.workingReady) {
        return;
    }

    renderExportCanvas();
    const { mimeType, quality } = getExportSettings();
    const blob = await new Promise((resolve) => {
        store.exportCanvas.toBlob(resolve, mimeType, quality);
    });
    if (!blob) {
        setStatus("Failed to prepare the download.");
        return;
    }

    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = state.downloadName;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
});

dom.resetButton.addEventListener("click", resetState);

dom.compareStage.addEventListener("pointermove", (event) => {
    if (!state.workingReady) {
        dom.wandCursor.hidden = true;
        dom.brushCursor.hidden = true;
        clearOverlay(dom, store);
        return;
    }

    if (state.cleanupTool === "wand") {
        dom.brushCursor.hidden = true;
        updateWandCursor(event);
        updateHoverSelection(event);
        return;
    }

    clearOverlay(dom, store);
    dom.wandCursor.hidden = true;
    updateBrushCursor(event);
    if (state.isBrushing) {
        paintAtPointer(event);
    }
});

dom.compareStage.addEventListener("pointerleave", () => {
    state.hoverSelection = null;
    dom.wandCursor.hidden = true;
    dom.brushCursor.hidden = true;
    state.isBrushing = false;
    clearOverlay(dom, store);
});

dom.compareStage.addEventListener("pointerdown", (event) => {
    if (!state.workingReady) {
        return;
    }

    if (state.cleanupTool === "brush") {
        const point = mapPointerToImage(event);
        if (!point) {
            return;
        }
        pushHistorySnapshot();
        state.isBrushing = true;
        dom.compareStage.setPointerCapture(event.pointerId);
        paintAtPointer(event);
        return;
    }

    const point = mapPointerToImage(event);
    if (!point) {
        return;
    }

    const selection = buildSelection(
        store,
        Math.round(point.x),
        Math.round(point.y),
        Number(dom.wandThreshold.value),
    );
    if (!selection || selection.count === 0) {
        setStatus("Magic Wand did not find a connected region at that tolerance.");
        return;
    }

    pushHistorySnapshot();
    applySelection(store, selection);
    state.hoverSelection = null;
    clearOverlay(dom, store);
    setStatus("Connected background region removed. Hover to preview the next area before you click.");
    renderStage();
});

dom.compareStage.addEventListener("pointerup", () => {
    state.isBrushing = false;
});

dom.form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const file = dom.fileInput.files?.[0];
    if (!file) {
        setStatus("Select an image before processing.");
        return;
    }

    setStatus("Running the AI cutout model...");
    const formData = new FormData();
    formData.append("file", file);
    formData.append("model_name", dom.modelSelect.value);

    try {
        const response = await fetch("/api/remove", {
            method: "POST",
            body: formData,
        });

        if (!response.ok) {
            const payload = await response.json().catch(() => ({ detail: "Processing failed." }));
            throw new Error(payload.detail || "Processing failed.");
        }

        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        const image = await loadImage(objectUrl);
        URL.revokeObjectURL(objectUrl);

        store.workingCanvas.width = image.naturalWidth;
        store.workingCanvas.height = image.naturalHeight;
        store.workingContext.clearRect(0, 0, store.workingCanvas.width, store.workingCanvas.height);
        store.workingContext.drawImage(image, 0, 0);
        state.workingReady = true;
        state.aiCutoutApplied = true;
        state.cleanupHistory = [];
        dom.undoButton.disabled = true;
        state.downloadName = createDownloadName(file.name, dom.formatSelect.value);
        dom.previewEmpty.hidden = true;
        dom.downloadButton.disabled = false;
        setStatus("Cutout ready. Use Magic Wand for connected regions or Brush for direct cleanup.");
        renderStage();
    } catch (error) {
        setStatus(error.message || "Background removal failed.");
    }
});

function handleFileSelection() {
    const file = dom.fileInput.files?.[0];
    if (!file) {
        return;
    }

    if (state.originalUrl) {
        URL.revokeObjectURL(state.originalUrl);
    }

    state.originalUrl = URL.createObjectURL(file);
    state.downloadName = createDownloadName(file.name, dom.formatSelect.value);

    loadImage(state.originalUrl).then((image) => {
        state.originalImage = image;
        store.originalCanvas.width = image.naturalWidth;
        store.originalCanvas.height = image.naturalHeight;
        store.originalContext.clearRect(0, 0, store.originalCanvas.width, store.originalCanvas.height);
        store.originalContext.drawImage(image, 0, 0);
        store.workingCanvas.width = image.naturalWidth;
        store.workingCanvas.height = image.naturalHeight;
        store.workingContext.clearRect(0, 0, store.workingCanvas.width, store.workingCanvas.height);
        store.workingContext.drawImage(image, 0, 0);
        state.workingReady = true;
        state.aiCutoutApplied = false;
        state.cleanupHistory = [];
        dom.undoButton.disabled = true;
        dom.downloadButton.disabled = false;
        state.hoverSelection = null;
        setStatus(`Loaded ${file.name}. You can use Magic Wand or Brush immediately, or generate an AI cutout first.`);
        renderStage();
    }).catch(() => {
        setStatus("Failed to load the selected image.");
    });
}

function renderStage() {
    syncCanvasSize(dom.resultCanvas, store.resultContext);
    syncCanvasSize(dom.overlayCanvas, store.overlayContext);

    if (!state.originalImage) {
        clearStage();
        return;
    }

    dom.resultCanvas.hidden = false;
    dom.overlayCanvas.hidden = false;
    dom.previewEmpty.hidden = state.workingReady;
    state.renderRect = drawContained(store.resultContext, dom.resultCanvas, getDisplaySource());
    drawHoverSelection();

    if (!state.workingReady) {
        dom.modePill.textContent = "Result view";
        dom.previewHint.textContent = "Upload an image to begin.";
    } else if (!state.aiCutoutApplied && state.viewMode === "result") {
        dom.modePill.textContent = "Editable original";
        dom.previewHint.textContent = state.cleanupTool === "wand"
            ? "Hover to preview the connected region. Click to remove it from the original."
            : "Brush directly erases from the original image.";
    } else if (state.cleanupTool === "brush") {
        dom.modePill.textContent = `${capitalize(state.viewMode)} view`;
        dom.previewHint.textContent = "Brush directly erases from the current working image.";
    } else {
        dom.modePill.textContent = `${capitalize(state.viewMode)} view`;
        dom.previewHint.textContent = "Hover to preview the connected region. Click to remove it.";
    }
}

function clearStage() {
    store.resultContext.clearRect(0, 0, dom.resultCanvas.clientWidth || 1, dom.resultCanvas.clientHeight || 1);
    clearOverlay(dom, store);
    dom.resultCanvas.hidden = true;
    dom.overlayCanvas.hidden = true;
    dom.previewEmpty.hidden = false;
    dom.modePill.textContent = "Result view";
    dom.previewHint.textContent = "Hover to preview the Magic Wand selection.";
}

function getDisplaySource() {
    if (state.viewMode === "original") {
        return state.originalImage;
    }

    if (state.viewMode === "mask") {
        return createMaskCanvas();
    }

    renderExportCanvas();
    return store.exportCanvas;
}

function renderExportCanvas() {
    if (!state.workingReady) {
        return;
    }

    store.exportCanvas.width = store.workingCanvas.width;
    store.exportCanvas.height = store.workingCanvas.height;
    store.exportContext.clearRect(0, 0, store.exportCanvas.width, store.exportCanvas.height);

    const background = getBackgroundValue();
    if (background !== "transparent") {
        store.exportContext.fillStyle = background;
        store.exportContext.fillRect(0, 0, store.exportCanvas.width, store.exportCanvas.height);
    }

    store.exportContext.drawImage(store.workingCanvas, 0, 0);
}

function createMaskCanvas() {
    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = store.workingCanvas.width;
    maskCanvas.height = store.workingCanvas.height;
    const maskContext = maskCanvas.getContext("2d");
    const imageData = store.workingContext.getImageData(0, 0, store.workingCanvas.width, store.workingCanvas.height);
    const pixels = imageData.data;

    for (let index = 0; index < pixels.length; index += 4) {
        const alpha = pixels[index + 3];
        pixels[index] = alpha;
        pixels[index + 1] = alpha;
        pixels[index + 2] = alpha;
        pixels[index + 3] = 255;
    }

    maskContext.putImageData(imageData, 0, 0);
    return maskCanvas;
}

function updateWandCursor(event) {
    const stageRect = dom.compareStage.getBoundingClientRect();
    dom.wandCursor.hidden = false;
    dom.wandCursor.style.left = `${event.clientX - stageRect.left}px`;
    dom.wandCursor.style.top = `${event.clientY - stageRect.top}px`;
}

function updateHoverSelection(event) {
    const point = mapPointerToImage(event);
    if (!point) {
        state.hoverSelection = null;
        clearOverlay(dom, store);
        return;
    }

    state.hoverSelection = buildSelection(
        store,
        Math.round(point.x),
        Math.round(point.y),
        Number(dom.wandThreshold.value),
    );
    drawHoverSelection();
}

function drawHoverSelection() {
    clearOverlay(dom, store);
    if (
        state.cleanupTool !== "wand"
        || !state.workingReady
        || !state.hoverSelection
        || state.hoverSelection.count === 0
        || !state.renderRect
    ) {
        return;
    }

    const imageOverlay = store.overlayContext.createImageData(
        state.hoverSelection.width,
        state.hoverSelection.height,
    );
    const pixels = imageOverlay.data;
    for (const pixel of state.hoverSelection.pixels) {
        const index = pixel * 4;
        pixels[index] = 218;
        pixels[index + 1] = 90;
        pixels[index + 2] = 42;
        pixels[index + 3] = 110;
    }

    const previewCanvas = document.createElement("canvas");
    previewCanvas.width = state.hoverSelection.width;
    previewCanvas.height = state.hoverSelection.height;
    previewCanvas.getContext("2d").putImageData(imageOverlay, 0, 0);
    store.overlayContext.drawImage(
        previewCanvas,
        state.renderRect.x,
        state.renderRect.y,
        state.renderRect.width,
        state.renderRect.height,
    );
}

function updateBrushCursor(event) {
    const point = mapPointerToStage(event);
    if (!point) {
        dom.brushCursor.hidden = true;
        return;
    }

    dom.brushCursor.hidden = false;
    dom.brushCursor.style.left = `${point.x}px`;
    dom.brushCursor.style.top = `${point.y}px`;
}

function paintAtPointer(event) {
    const point = mapPointerToImage(event);
    if (!point || !state.renderRect) {
        return;
    }

    const radius = (Number(dom.brushSize.value) * (store.workingCanvas.width / state.renderRect.width)) / 2;
    paintBrush(store, point, radius);
    renderStage();
}

function undoCleanup() {
    const snapshot = state.cleanupHistory.pop();
    if (!snapshot) {
        dom.undoButton.disabled = true;
        return;
    }

    loadImage(snapshot).then((image) => {
        store.workingCanvas.width = image.naturalWidth;
        store.workingCanvas.height = image.naturalHeight;
        store.workingContext.clearRect(0, 0, store.workingCanvas.width, store.workingCanvas.height);
        store.workingContext.drawImage(image, 0, 0);
        dom.undoButton.disabled = state.cleanupHistory.length === 0;
        renderStage();
    });
}

function pushHistorySnapshot() {
    state.cleanupHistory.push(store.workingCanvas.toDataURL("image/png"));
    if (state.cleanupHistory.length > 15) {
        state.cleanupHistory.shift();
    }
    dom.undoButton.disabled = false;
}

function mapPointerToImage(event) {
    if (!state.renderRect) {
        return null;
    }

    const stageRect = dom.compareStage.getBoundingClientRect();
    const x = event.clientX - stageRect.left;
    const y = event.clientY - stageRect.top;
    if (
        x < state.renderRect.x
        || x > state.renderRect.x + state.renderRect.width
        || y < state.renderRect.y
        || y > state.renderRect.y + state.renderRect.height
    ) {
        return null;
    }

    return {
        x: ((x - state.renderRect.x) / state.renderRect.width) * store.workingCanvas.width,
        y: ((y - state.renderRect.y) / state.renderRect.height) * store.workingCanvas.height,
    };
}

function mapPointerToStage(event) {
    if (!state.renderRect) {
        return null;
    }

    const stageRect = dom.compareStage.getBoundingClientRect();
    const x = event.clientX - stageRect.left;
    const y = event.clientY - stageRect.top;
    if (
        x < state.renderRect.x
        || x > state.renderRect.x + state.renderRect.width
        || y < state.renderRect.y
        || y > state.renderRect.y + state.renderRect.height
    ) {
        return null;
    }

    return { x, y };
}

function getBackgroundValue() {
    return dom.backgroundSelect.value === "custom"
        ? dom.customColorInput.value
        : dom.backgroundSelect.value;
}

function getExportSettings() {
    if (dom.formatSelect.value === "jpeg") {
        return { mimeType: "image/jpeg", quality: Number(dom.qualityRange.value) / 100 };
    }
    if (dom.formatSelect.value === "webp") {
        return { mimeType: "image/webp", quality: Number(dom.qualityRange.value) / 100 };
    }
    return { mimeType: "image/png", quality: Number(dom.qualityRange.value) / 100 };
}

function createDownloadName(fileName, extension) {
    const stem = fileName.replace(/\.[^.]+$/, "") || "image";
    const suffix = extension === "jpeg" ? "jpg" : extension;
    return `${stem}-no-bg.${suffix}`;
}

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = src;
    });
}

function resetState() {
    dom.form.reset();
    dom.qualityValue.textContent = dom.qualityRange.value;
    dom.brushSizeValue.textContent = dom.brushSize.value;
    dom.wandThresholdValue.textContent = dom.wandThreshold.value;
    dom.customColorGroup.hidden = true;
    state.cleanupHistory = [];
    dom.undoButton.disabled = true;
    state.workingReady = false;
    state.aiCutoutApplied = false;
    state.originalImage = null;
    state.hoverSelection = null;
    state.renderRect = null;
    state.viewMode = "result";
    state.cleanupTool = "wand";
    dom.viewModeButtons.forEach((button) => {
        button.classList.toggle("active", button.dataset.view === "result");
    });
    dom.wandToggle.classList.add("active");
    dom.wandToggle.setAttribute("aria-pressed", "true");
    dom.brushToggle.classList.remove("active");
    dom.brushToggle.setAttribute("aria-pressed", "false");

    if (state.originalUrl) {
        URL.revokeObjectURL(state.originalUrl);
        state.originalUrl = "";
    }

    store.workingCanvas.width = 1;
    store.workingCanvas.height = 1;
    store.originalCanvas.width = 1;
    store.originalCanvas.height = 1;
    store.exportCanvas.width = 1;
    store.exportCanvas.height = 1;
    dom.resultCanvas.hidden = true;
    dom.overlayCanvas.hidden = true;
    dom.previewEmpty.hidden = false;
    dom.downloadButton.disabled = true;
    dom.wandCursor.hidden = true;
    dom.brushCursor.hidden = true;
    clearOverlay(dom, store);
    setStatus("Upload an image to start. Use Studio Cutout for the best general result.");
    renderStage();
}

function setStatus(message) {
    dom.statusCard.textContent = message;
}

function capitalize(value) {
    return value.charAt(0).toUpperCase() + value.slice(1);
}

function syncBrushCursorSize() {
    const size = Number(dom.brushSize.value);
    dom.brushCursor.style.width = `${size}px`;
    dom.brushCursor.style.height = `${size}px`;
    dom.brushCursor.style.marginLeft = `${size / -2}px`;
    dom.brushCursor.style.marginTop = `${size / -2}px`;
}

dom.qualityValue.textContent = dom.qualityRange.value;
dom.brushSizeValue.textContent = dom.brushSize.value;
dom.wandThresholdValue.textContent = dom.wandThreshold.value;
syncBrushCursorSize();
renderStage();
