import { clearOverlay, createCanvasStore, drawContained, initializeCanvasStore, syncCanvasSize } from "./canvas.js";
import {
    applySelection,
    applyRectSelection,
    buildSelection,
    eraseBrush,
    restoreBrush,
    restoreRectSelection,
    restoreSelection,
} from "./cleanup.js";
import { dom } from "./dom.js";
import { createEditorState } from "./state.js";

const MODEL_PRESETS = [
    {
        value: "birefnet-general",
        label: "Studio",
        copy: "Strong all-round cutout",
    },
    {
        value: "birefnet-portrait",
        label: "Portrait",
        copy: "Tuned for people and hair",
    },
    {
        value: "isnet-general-use",
        label: "Balanced",
        copy: "Lightweight general cutout",
    },
];

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

dom.zoomInButton.addEventListener("click", () => setZoom(state.zoom + 0.25));
dom.zoomOutButton.addEventListener("click", () => setZoom(state.zoom - 0.25));
dom.zoomResetButton.addEventListener("click", resetZoom);
dom.zoom200Button.addEventListener("click", () => setZoom(2));
dom.applyRectButton.addEventListener("click", applyRectSelectionAction);
dom.clearRectButton.addEventListener("click", clearRectSelection);
dom.applyCropButton.addEventListener("click", applyCrop);
dom.clearCropButton.addEventListener("click", clearCropSelection);

dom.brushSize.addEventListener("input", () => {
    dom.brushSizeValue.textContent = dom.brushSize.value;
    syncBrushCursorSize();
});

dom.brushShapeGroup.addEventListener("click", (event) => {
    const button = event.target.closest(".tool-button");
    if (!button || !button.dataset.brushShape) {
        return;
    }

    state.brushShape = button.dataset.brushShape;
    dom.brushShapeRound.classList.toggle("active", state.brushShape === "round");
    dom.brushShapeSquare.classList.toggle("active", state.brushShape === "square");
    dom.brushShapeRound.setAttribute("aria-pressed", String(state.brushShape === "round"));
    dom.brushShapeSquare.setAttribute("aria-pressed", String(state.brushShape === "square"));
    syncBrushCursorSize();
    syncWorkspaceSummary();
    renderStage();
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
    if (!button || !button.dataset.tool) {
        return;
    }

    setCleanupTool(button.dataset.tool);
});

dom.actionGroup.addEventListener("click", (event) => {
    const button = event.target.closest(".tool-button");
    if (!button) {
        return;
    }

    state.editAction = button.dataset.action;
    dom.removeAction.classList.toggle("active", state.editAction === "remove");
    dom.restoreAction.classList.toggle("active", state.editAction === "restore");
    dom.removeAction.setAttribute("aria-pressed", String(state.editAction === "remove"));
    dom.restoreAction.setAttribute("aria-pressed", String(state.editAction === "restore"));
    syncWorkspaceSummary();
    renderStage();
});

dom.undoButton.addEventListener("click", undoCleanup);

dom.viewModeGroup.addEventListener("click", (event) => {
    const button = event.target.closest(".view-mode-button");
    if (!button) {
        return;
    }

    state.viewMode = button.dataset.view;
    renderViewButtons();
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
dom.previewPackButton.addEventListener("click", generatePreviewPack);

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

    if (state.isPanning) {
        dom.compareStage.style.cursor = "grabbing";
        updatePan(event);
        return;
    }

    if (state.cleanupTool === "crop" || state.cleanupTool === "rect") {
        dom.wandCursor.hidden = true;
        dom.brushCursor.hidden = true;
        dom.compareStage.style.cursor = "crosshair";
        if (state.cleanupTool === "crop") {
            if (state.isCropping) {
                updateCropSelection(event);
            } else {
                drawCropSelection();
            }
        } else {
            if (state.isSelectingRect) {
                updateRectSelection(event);
            } else {
                drawRectSelection();
            }
        }
        return;
    }

    if (state.cleanupTool === "wand") {
        dom.compareStage.style.cursor = "default";
        dom.brushCursor.hidden = true;
        updateWandCursor(event);
        updateHoverSelection(event);
        return;
    }

    if (state.cleanupTool === "pan" || state.isSpacePanning) {
        clearOverlay(dom, store);
        dom.wandCursor.hidden = true;
        dom.brushCursor.hidden = true;
        dom.compareStage.style.cursor = state.isPanning ? "grabbing" : "grab";
        return;
    }

    clearOverlay(dom, store);
    dom.wandCursor.hidden = true;
    dom.compareStage.style.cursor = "default";
    updateBrushCursor(event);
    if (state.isBrushing) {
        paintAtPointer(event);
    }
});

dom.compareStage.addEventListener("pointerleave", () => {
    state.hoverSelection = null;
    dom.wandCursor.hidden = true;
    dom.brushCursor.hidden = true;
    if (!state.isBrushing && !state.isCropping && !state.isSelectingRect && !state.isPanning) {
        dom.compareStage.style.cursor = "default";
        updatePanUi();
        renderStage();
    }
});

dom.compareStage.addEventListener("pointerdown", (event) => {
    if (!state.workingReady) {
        return;
    }

    if (state.cleanupTool === "pan") {
        state.isPanning = true;
        state.panStart = {
            clientX: event.clientX,
            clientY: event.clientY,
            panX: state.panX,
            panY: state.panY,
        };
        dom.compareStage.style.cursor = "grabbing";
        dom.compareStage.setPointerCapture(event.pointerId);
        updatePanUi();
        return;
    }

    if (state.isSpacePanning || (event.altKey && state.zoom > 1)) {
        state.isPanning = true;
        state.panStart = {
            clientX: event.clientX,
            clientY: event.clientY,
            panX: state.panX,
            panY: state.panY,
        };
        dom.compareStage.setPointerCapture(event.pointerId);
        updatePanUi();
        return;
    }

    if (state.cleanupTool === "rect") {
        const point = mapPointerToImage(event);
        if (!point) {
            return;
        }
        state.isSelectingRect = true;
        state.rectStart = point;
        state.rectSelection = normalizeCropRect(point, point);
        dom.compareStage.setPointerCapture(event.pointerId);
        drawRectSelection();
        syncRectButtons();
        return;
    }

    if (state.cleanupTool === "crop") {
        const point = mapPointerToImage(event);
        if (!point) {
            return;
        }
        state.isCropping = true;
        state.cropStart = point;
        state.cropRect = normalizeCropRect(point, point);
        dom.compareStage.setPointerCapture(event.pointerId);
        drawCropSelection();
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
    if (state.editAction === "restore") {
        restoreSelection(store, selection);
    } else {
        applySelection(store, selection);
    }
    state.hoverSelection = null;
    clearOverlay(dom, store);
    setStatus(
        state.editAction === "restore"
            ? "Connected region restored from the original image."
            : "Connected background region removed. Hover to preview the next area before you click.",
    );
    renderStage();
});

dom.compareStage.addEventListener("pointerup", (event) => finishPointerInteraction(event));
dom.compareStage.addEventListener("pointercancel", (event) => finishPointerInteraction(event));
dom.compareStage.addEventListener("lostpointercapture", () => finishPointerInteraction());

window.addEventListener("pointerup", (event) => finishPointerInteraction(event));
window.addEventListener("pointercancel", (event) => finishPointerInteraction(event));

dom.compareStage.addEventListener("dblclick", () => {
    resetZoom();
});

dom.compareStage.addEventListener("wheel", (event) => {
    if (!state.workingReady) {
        return;
    }

    event.preventDefault();
    const delta = event.deltaY < 0 ? 0.2 : -0.2;
    setZoom(state.zoom + delta);
});

window.addEventListener("keydown", (event) => {
    if (event.code === "Space" && !state.isSpacePanning) {
        state.isSpacePanning = true;
        dom.compareStage.style.cursor = state.isPanning ? "grabbing" : "grab";
        updatePanUi();
    }

    if (event.key.toLowerCase() === "o" && !state.transientViewMode) {
        state.transientViewMode = state.viewMode;
        state.viewMode = "original";
        renderViewButtons();
        renderStage();
    }
});

window.addEventListener("keyup", (event) => {
    if (event.code === "Space") {
        state.isSpacePanning = false;
        finishPointerInteraction();
    }

    if (event.key.toLowerCase() === "o" && state.transientViewMode) {
        state.viewMode = state.transientViewMode;
        state.transientViewMode = null;
        renderViewButtons();
        renderStage();
    }
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
        state.rectSelection = null;
        state.rectStart = null;
        state.cropRect = null;
        state.cropStart = null;
        dom.undoButton.disabled = true;
        state.downloadName = createDownloadName(file.name, dom.formatSelect.value);
        dom.previewEmpty.hidden = true;
        dom.downloadButton.disabled = false;
        setStatus("Cutout ready. Use Magic Wand, Brush, or Rectangle in remove or restore mode.");
        syncWorkspaceSummary();
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
        state.rectSelection = null;
        state.rectStart = null;
        state.cropRect = null;
        state.cropStart = null;
        dom.undoButton.disabled = true;
        dom.downloadButton.disabled = false;
        state.hoverSelection = null;
        resetZoom();
        clearPreviewPack();
        syncFileDetails(file, image);
        setStatus(`Loaded ${file.name}. You can use Magic Wand, Brush, or Rectangle immediately in remove or restore mode, or generate an AI cutout first.`);
        renderStage();
    }).catch(() => {
        setStatus("Failed to load the selected image.");
    });
}

function renderStage() {
    syncCanvasSize(dom.resultCanvas, store.resultContext);
    syncCanvasSize(dom.overlayCanvas, store.overlayContext);
    syncContextControls();

    if (!state.originalImage) {
        clearStage();
        return;
    }

    dom.resultCanvas.hidden = false;
    dom.overlayCanvas.hidden = false;
    dom.previewEmpty.hidden = state.workingReady;
    state.renderRect = drawZoomedImage(getDisplaySource());
    renderOverlay();
    dom.zoomValue.textContent = `${Math.round(state.zoom * 100)}%`;

    if (!state.workingReady) {
        dom.modePill.textContent = "Result view";
        dom.previewHint.textContent = "Upload an image to begin.";
    } else if (!state.aiCutoutApplied && state.viewMode === "result") {
        dom.modePill.textContent = "Editable original";
        if (state.cleanupTool === "wand") {
            dom.previewHint.textContent = `Hover to preview the connected region. Click to ${state.editAction} it.`;
        } else if (state.cleanupTool === "brush") {
            dom.previewHint.textContent = `${capitalize(state.brushShape)} brush will ${state.editAction} directly on the original image.`;
        } else if (state.cleanupTool === "rect") {
            dom.previewHint.textContent = state.rectSelection
                ? `Rectangle ready. Apply it to ${state.editAction} that area.`
                : `Drag a rectangle to ${state.editAction} part of the background.`;
        } else if (state.cleanupTool === "crop") {
            dom.previewHint.textContent = state.cropRect
                ? "Drag to redraw the crop box, then apply it."
                : "Drag on the image to create a crop box before generating the cutout.";
        } else {
            dom.previewHint.textContent = "Pan mode is active. Click and drag to move the image.";
        }
    } else if (state.cleanupTool === "pan") {
        dom.modePill.textContent = state.isPanning ? "Panning" : `${capitalize(state.viewMode)} view`;
        dom.previewHint.textContent = state.isPanning
            ? "Release the pointer to stop panning."
            : "Pan mode is active. Click and drag to move the image.";
    } else if (state.cleanupTool === "crop") {
        dom.modePill.textContent = "Crop mode";
        dom.previewHint.textContent = state.cropRect
            ? "Drag to redraw the crop box, then apply it."
            : "Drag on the image to create a crop box before or after background removal.";
    } else if (state.cleanupTool === "rect") {
        dom.modePill.textContent = "Rectangle mode";
        dom.previewHint.textContent = state.rectSelection
            ? state.editAction === "restore"
                ? "Rectangle ready. Apply it to restore that area from the original."
                : "Rectangle ready. Apply it to clear that area."
            : state.editAction === "restore"
                ? "Drag a rectangle over the area you want to restore from the original."
                : "Drag a rectangle over the background area you want to remove.";
    } else if (state.cleanupTool === "brush") {
        dom.modePill.textContent = `${capitalize(state.viewMode)} view`;
        dom.previewHint.textContent = state.editAction === "restore"
            ? `${capitalize(state.brushShape)} brush restores from the original image.`
            : `${capitalize(state.brushShape)} brush directly erases from the current working image.`;
    } else {
        dom.modePill.textContent = `${capitalize(state.viewMode)} view`;
        dom.previewHint.textContent = state.editAction === "restore"
            ? "Hover to preview the connected region. Click to restore it from the original."
            : "Hover to preview the connected region. Click to remove it.";
    }

    syncCropButtons();
    syncWorkspaceSummary();
}

function clearStage() {
    store.resultContext.clearRect(0, 0, dom.resultCanvas.clientWidth || 1, dom.resultCanvas.clientHeight || 1);
    clearOverlay(dom, store);
    dom.resultCanvas.hidden = true;
    dom.overlayCanvas.hidden = true;
    dom.previewEmpty.hidden = false;
    dom.modePill.textContent = "Result view";
    dom.previewHint.textContent = "Hover to preview the Magic Wand selection.";
    dom.zoomValue.textContent = "100%";
    dom.panOverlay.hidden = true;
    dom.compareStage.classList.remove("pan-ready", "pan-locked", "crop-ready");
    syncContextControls();
    syncCropButtons();
    syncRectButtons();
    syncWorkspaceSummary();
}

function getDisplaySource() {
    if (state.viewMode === "original") {
        return store.originalCanvas;
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
    const point = mapPointerToStage(event);
    if (!point) {
        dom.wandCursor.hidden = true;
        return;
    }
    dom.wandCursor.hidden = false;
    dom.wandCursor.style.left = `${point.x}px`;
    dom.wandCursor.style.top = `${point.y}px`;
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

function renderOverlay() {
    if (state.cleanupTool === "crop") {
        drawCropSelection();
        return;
    }
    if (state.cleanupTool === "rect") {
        drawRectSelection();
        return;
    }
    drawHoverSelection();
}

function drawCropSelection() {
    clearOverlay(dom, store);
    if (
        state.cleanupTool !== "crop"
        || !state.workingReady
        || !state.cropRect
        || !state.renderRect
    ) {
        return;
    }

    const cropRect = mapImageRectToStage(state.cropRect);
    if (!cropRect) {
        return;
    }

    store.overlayContext.save();
    store.overlayContext.fillStyle = "rgba(34, 23, 13, 0.45)";
    store.overlayContext.fillRect(0, 0, dom.overlayCanvas.clientWidth || 1, dom.overlayCanvas.clientHeight || 1);
    store.overlayContext.clearRect(cropRect.x, cropRect.y, cropRect.width, cropRect.height);
    store.overlayContext.strokeStyle = "rgba(255, 255, 255, 0.98)";
    store.overlayContext.lineWidth = 2;
    store.overlayContext.setLineDash([8, 6]);
    store.overlayContext.strokeRect(cropRect.x, cropRect.y, cropRect.width, cropRect.height);
    store.overlayContext.restore();
}

function drawRectSelection() {
    clearOverlay(dom, store);
    if (
        state.cleanupTool !== "rect"
        || !state.workingReady
        || !state.rectSelection
        || !state.renderRect
    ) {
        return;
    }

    const rect = mapImageRectToStage(state.rectSelection);
    if (!rect) {
        return;
    }

    store.overlayContext.save();
    store.overlayContext.fillStyle = state.editAction === "restore"
        ? "rgba(15, 118, 110, 0.16)"
        : "rgba(216, 91, 42, 0.18)";
    store.overlayContext.strokeStyle = state.editAction === "restore"
        ? "rgba(15, 118, 110, 0.95)"
        : "rgba(216, 91, 42, 0.95)";
    store.overlayContext.lineWidth = 2;
    store.overlayContext.setLineDash([8, 6]);
    store.overlayContext.fillRect(rect.x, rect.y, rect.width, rect.height);
    store.overlayContext.strokeRect(rect.x, rect.y, rect.width, rect.height);
    store.overlayContext.restore();
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
    if (state.editAction === "restore") {
        restoreBrush(store, point, radius, state.brushShape);
    } else {
        eraseBrush(store, point, radius, state.brushShape);
    }
    renderStage();
}

function undoCleanup() {
    const snapshot = state.cleanupHistory.pop();
    if (!snapshot) {
        dom.undoButton.disabled = true;
        return;
    }

    Promise.all([
        loadImage(snapshot.working),
        loadImage(snapshot.original),
    ]).then(([workingImage, originalImage]) => {
        store.workingCanvas.width = workingImage.naturalWidth;
        store.workingCanvas.height = workingImage.naturalHeight;
        store.workingContext.clearRect(0, 0, store.workingCanvas.width, store.workingCanvas.height);
        store.workingContext.drawImage(workingImage, 0, 0);
        store.originalCanvas.width = originalImage.naturalWidth;
        store.originalCanvas.height = originalImage.naturalHeight;
        store.originalContext.clearRect(0, 0, store.originalCanvas.width, store.originalCanvas.height);
        store.originalContext.drawImage(originalImage, 0, 0);
        state.originalImage = originalImage;
        dom.undoButton.disabled = state.cleanupHistory.length === 0;
        renderStage();
    });
}

function pushHistorySnapshot() {
    state.cleanupHistory.push({
        working: store.workingCanvas.toDataURL("image/png"),
        original: store.originalCanvas.toDataURL("image/png"),
    });
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

function mapPointerToImageClamped(event) {
    if (!state.renderRect) {
        return null;
    }

    const stageRect = dom.compareStage.getBoundingClientRect();
    const x = clampValue(event.clientX - stageRect.left, state.renderRect.x, state.renderRect.x + state.renderRect.width);
    const y = clampValue(event.clientY - stageRect.top, state.renderRect.y, state.renderRect.y + state.renderRect.height);
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

function mapImageRectToStage(rect) {
    if (!state.renderRect) {
        return null;
    }

    return {
        x: state.renderRect.x + ((rect.x / store.workingCanvas.width) * state.renderRect.width),
        y: state.renderRect.y + ((rect.y / store.workingCanvas.height) * state.renderRect.height),
        width: (rect.width / store.workingCanvas.width) * state.renderRect.width,
        height: (rect.height / store.workingCanvas.height) * state.renderRect.height,
    };
}

function drawZoomedImage(source) {
    if (!source) {
        return null;
    }

    const baseRect = drawContained(store.resultContext, dom.resultCanvas, source);
    if (!baseRect) {
        return null;
    }

    if (state.zoom === 1 && state.panX === 0 && state.panY === 0) {
        return baseRect;
    }

    store.resultContext.clearRect(
        0,
        0,
        dom.resultCanvas.clientWidth || 1,
        dom.resultCanvas.clientHeight || 1,
    );

    const zoomedWidth = baseRect.width * state.zoom;
    const zoomedHeight = baseRect.height * state.zoom;
    const centeredX = (dom.resultCanvas.clientWidth - zoomedWidth) / 2;
    const centeredY = (dom.resultCanvas.clientHeight - zoomedHeight) / 2;
    const offsetX = clampPan(centeredX + state.panX, zoomedWidth, dom.resultCanvas.clientWidth);
    const offsetY = clampPan(centeredY + state.panY, zoomedHeight, dom.resultCanvas.clientHeight);
    store.resultContext.drawImage(source, offsetX, offsetY, zoomedWidth, zoomedHeight);
    state.panX = offsetX - centeredX;
    state.panY = offsetY - centeredY;
    return { x: offsetX, y: offsetY, width: zoomedWidth, height: zoomedHeight };
}

function clampPan(offset, drawSize, viewportSize) {
    if (drawSize <= viewportSize) {
        return (viewportSize - drawSize) / 2;
    }
    const minOffset = viewportSize - drawSize;
    const maxOffset = 0;
    return Math.min(maxOffset, Math.max(minOffset, offset));
}

function setZoom(nextZoom) {
    state.zoom = Math.min(4, Math.max(1, Math.round(nextZoom * 100) / 100));
    if (state.zoom === 1) {
        state.panX = 0;
        state.panY = 0;
    }
    renderStage();
}

function resetZoom() {
    state.zoom = 1;
    state.panX = 0;
    state.panY = 0;
    renderStage();
}

function updatePan(event) {
    if (!state.panStart) {
        return;
    }
    state.panX = state.panStart.panX + (event.clientX - state.panStart.clientX);
    state.panY = state.panStart.panY + (event.clientY - state.panStart.clientY);
    renderStage();
}

function finishPointerInteraction(event) {
    const wasBrushing = state.isBrushing;
    const wasCropping = state.isCropping;
    const wasSelectingRect = state.isSelectingRect;
    const wasPanning = state.isPanning;

    state.isBrushing = false;
    if (state.isCropping && event) {
        updateCropSelection(event);
    }
    if (state.isSelectingRect && event) {
        updateRectSelection(event);
    }
    state.isCropping = false;
    state.isSelectingRect = false;
    state.isPanning = false;
    state.panStart = null;

    if (event?.pointerId !== undefined && dom.compareStage.hasPointerCapture(event.pointerId)) {
        dom.compareStage.releasePointerCapture(event.pointerId);
    }

    dom.compareStage.style.cursor = state.cleanupTool === "pan" || state.isSpacePanning
        ? "grab"
        : state.cleanupTool === "crop" || state.cleanupTool === "rect"
            ? "crosshair"
            : "default";
    updatePanUi();

    if (wasBrushing || wasCropping || wasSelectingRect || wasPanning) {
        renderStage();
    }
}

function updateCropSelection(event) {
    if (!state.cropStart) {
        return;
    }

    const point = mapPointerToImageClamped(event);
    if (!point) {
        return;
    }

    state.cropRect = normalizeCropRect(state.cropStart, point);
    drawCropSelection();
    syncCropButtons();
}

function updateRectSelection(event) {
    if (!state.rectStart) {
        return;
    }

    const point = mapPointerToImageClamped(event);
    if (!point) {
        return;
    }

    state.rectSelection = normalizeCropRect(state.rectStart, point);
    drawRectSelection();
    syncRectButtons();
}

function normalizeCropRect(start, end) {
    const maxWidth = store.workingCanvas.width;
    const maxHeight = store.workingCanvas.height;
    const startX = clampValue(start.x, 0, maxWidth);
    const startY = clampValue(start.y, 0, maxHeight);
    const endX = clampValue(end.x, 0, maxWidth);
    const endY = clampValue(end.y, 0, maxHeight);
    const x = Math.floor(Math.min(startX, endX));
    const y = Math.floor(Math.min(startY, endY));
    const width = Math.max(1, Math.floor(Math.abs(endX - startX)));
    const height = Math.max(1, Math.floor(Math.abs(endY - startY)));
    return { x, y, width, height };
}

async function applyCrop() {
    if (!state.cropRect || !state.workingReady) {
        return;
    }

    if (state.cropRect.width < 2 || state.cropRect.height < 2) {
        setStatus("Draw a larger crop box before applying it.");
        return;
    }

    pushHistorySnapshot();
    cropCanvas(store.originalCanvas, store.originalContext, state.cropRect);
    cropCanvas(store.workingCanvas, store.workingContext, state.cropRect);
    state.cropRect = null;
    state.cropStart = null;
    state.hoverSelection = null;
    await syncOriginalImageFromCanvas();
    setStatus("Crop applied to the original image and current result.");
    renderStage();
}

function applyRectSelectionAction() {
    if (!state.rectSelection || !state.workingReady) {
        return;
    }

    if (state.rectSelection.width < 2 || state.rectSelection.height < 2) {
        setStatus("Draw a larger rectangle before applying it.");
        return;
    }

    pushHistorySnapshot();
    if (state.editAction === "restore") {
        restoreRectSelection(store, state.rectSelection);
        setStatus("Rectangle selection restored from the original image.");
    } else {
        applyRectSelection(store, state.rectSelection);
        setStatus("Rectangle selection cleared from the current result.");
    }
    state.rectSelection = null;
    state.rectStart = null;
    state.hoverSelection = null;
    syncRectButtons();
    renderStage();
}

function clearRectSelection() {
    state.rectSelection = null;
    state.rectStart = null;
    state.isSelectingRect = false;
    syncRectButtons();
    renderStage();
}

function clearCropSelection() {
    state.cropRect = null;
    state.cropStart = null;
    state.isCropping = false;
    renderStage();
}

function cropCanvas(canvas, context, rect) {
    const snapshot = document.createElement("canvas");
    snapshot.width = rect.width;
    snapshot.height = rect.height;
    const snapshotContext = snapshot.getContext("2d");
    snapshotContext.drawImage(
        canvas,
        rect.x,
        rect.y,
        rect.width,
        rect.height,
        0,
        0,
        rect.width,
        rect.height,
    );
    canvas.width = rect.width;
    canvas.height = rect.height;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(snapshot, 0, 0);
}

async function syncOriginalImageFromCanvas() {
    const image = await loadImage(store.originalCanvas.toDataURL("image/png"));
    state.originalImage = image;
}

function syncCropButtons() {
    const hasCrop = Boolean(state.cropRect);
    dom.applyCropButton.disabled = !hasCrop || !state.workingReady;
    dom.clearCropButton.disabled = !hasCrop;
}

function syncRectButtons() {
    const hasRect = Boolean(state.rectSelection);
    dom.applyRectButton.disabled = !hasRect || !state.workingReady;
    dom.clearRectButton.disabled = !hasRect;
}

function setCleanupTool(tool) {
    state.cleanupTool = tool;
    state.hoverSelection = null;
    state.isCropping = false;
    state.isSelectingRect = false;
    state.isBrushing = false;
    state.isPanning = false;
    state.panStart = null;
    dom.wandToggle.classList.toggle("active", state.cleanupTool === "wand");
    dom.brushToggle.classList.toggle("active", state.cleanupTool === "brush");
    dom.rectToggle.classList.toggle("active", state.cleanupTool === "rect");
    dom.cropToggle.classList.toggle("active", state.cleanupTool === "crop");
    dom.panToggle.classList.toggle("active", state.cleanupTool === "pan");
    dom.wandToggle.setAttribute("aria-pressed", String(state.cleanupTool === "wand"));
    dom.brushToggle.setAttribute("aria-pressed", String(state.cleanupTool === "brush"));
    dom.rectToggle.setAttribute("aria-pressed", String(state.cleanupTool === "rect"));
    dom.cropToggle.setAttribute("aria-pressed", String(state.cleanupTool === "crop"));
    dom.panToggle.setAttribute("aria-pressed", String(state.cleanupTool === "pan"));
    dom.wandCursor.hidden = true;
    dom.brushCursor.hidden = true;
    clearOverlay(dom, store);
    dom.compareStage.style.cursor = state.cleanupTool === "pan"
        ? "grab"
        : state.cleanupTool === "crop" || state.cleanupTool === "rect"
            ? "crosshair"
            : "default";
    updatePanUi();
    syncContextControls();
    syncWorkspaceSummary();
    renderStage();
}

function updatePanUi() {
    const panReady = state.cleanupTool === "pan" || state.isSpacePanning;
    dom.panOverlay.hidden = !panReady;
    dom.compareStage.classList.toggle("pan-ready", panReady && !state.isPanning);
    dom.compareStage.classList.toggle("pan-locked", state.isPanning);
    dom.compareStage.classList.toggle("crop-ready", state.cleanupTool === "crop");

    if (!panReady) {
        dom.panOverlayBadge.textContent = "Pan Ready";
        return;
    }

    dom.panOverlayBadge.textContent = state.isPanning
        ? "Panning"
        : state.isSpacePanning
            ? "Temporary Pan"
            : "Pan Ready · Drag to Move";
}

function syncContextControls() {
    const isWand = state.cleanupTool === "wand";
    const isBrush = state.cleanupTool === "brush";
    const isRect = state.cleanupTool === "rect";
    const isCrop = state.cleanupTool === "crop";
    const isPan = state.cleanupTool === "pan";

    dom.editActionBlock.hidden = isCrop || isPan;
    dom.wandControlGroup.hidden = !isWand;
    dom.brushControlGroup.hidden = !isBrush;
    dom.rectControlGroup.hidden = !isRect;
    dom.cropControlGroup.hidden = !isCrop;
    if (dom.panControlGroup) {
        dom.panControlGroup.hidden = !isPan;
    }
}

function clampValue(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

async function generatePreviewPack() {
    const file = dom.fileInput.files?.[0];
    if (!file) {
        setStatus("Upload an image before generating preview variations.");
        return;
    }

    dom.previewPackButton.disabled = true;
    dom.previewPackStatus.textContent = "Generating preview pack...";
    clearPreviewPack();

    for (const preset of MODEL_PRESETS) {
        const preview = await fetchModelPreview(file, preset);
        if (preview) {
            state.previewResults.push(preview);
        }
    }

    renderPreviewCards();
    dom.previewPackStatus.textContent = state.previewResults.length
        ? "Preview pack ready. Click any card to apply that cutout."
        : "Preview generation failed.";
    dom.previewPackButton.disabled = false;
    syncWorkspaceSummary();
}

async function fetchModelPreview(file, preset) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("model_name", preset.value);

    try {
        const response = await fetch("/api/remove", {
            method: "POST",
            body: formData,
        });
        if (!response.ok) {
            return null;
        }
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const image = await loadImage(url);
        return { ...preset, url, image };
    } catch {
        return null;
    }
}

function renderPreviewCards() {
    dom.previewCards.innerHTML = "";
    for (const preview of state.previewResults) {
        const card = document.createElement("button");
        card.type = "button";
        card.className = "preview-card";
        if (preview.value === dom.modelSelect.value) {
            card.classList.add("active");
        }
        card.innerHTML = `
            <img src="${preview.url}" alt="${preview.label} preview">
            <div class="preview-card-title">${preview.label}</div>
            <p class="preview-card-copy">${preview.copy}</p>
        `;
        card.addEventListener("click", () => applyPreview(preview));
        dom.previewCards.appendChild(card);
    }
}

function applyPreview(preview) {
    dom.modelSelect.value = preview.value;
    store.workingCanvas.width = preview.image.naturalWidth;
    store.workingCanvas.height = preview.image.naturalHeight;
    store.workingContext.clearRect(0, 0, store.workingCanvas.width, store.workingCanvas.height);
    store.workingContext.drawImage(preview.image, 0, 0);
    state.workingReady = true;
    state.aiCutoutApplied = true;
    state.cleanupHistory = [];
    state.rectSelection = null;
    state.rectStart = null;
    state.cropRect = null;
    state.cropStart = null;
    dom.undoButton.disabled = true;
    renderPreviewCards();
    syncWorkspaceSummary();
    setStatus(`${preview.label} preview applied to the editor.`);
    renderStage();
}

function clearPreviewPack() {
    for (const preview of state.previewResults) {
        URL.revokeObjectURL(preview.url);
    }
    state.previewResults = [];
    dom.previewCards.innerHTML = "";
    syncWorkspaceSummary();
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
    state.isCropping = false;
    state.isSelectingRect = false;
    state.isPanning = false;
    state.isBrushing = false;
    state.panStart = null;
    state.rectStart = null;
    state.rectSelection = null;
    state.cropStart = null;
    state.cropRect = null;
    state.viewMode = "result";
    state.cleanupTool = "wand";
    state.editAction = "remove";
    state.brushShape = "round";
    state.isSpacePanning = false;
    state.transientViewMode = null;
    state.zoom = 1;
    state.panX = 0;
    state.panY = 0;
    syncFileDetails();
    renderViewButtons();
    dom.wandToggle.classList.add("active");
    dom.wandToggle.setAttribute("aria-pressed", "true");
    dom.brushToggle.classList.remove("active");
    dom.brushToggle.setAttribute("aria-pressed", "false");
    dom.rectToggle.classList.remove("active");
    dom.rectToggle.setAttribute("aria-pressed", "false");
    dom.cropToggle.classList.remove("active");
    dom.cropToggle.setAttribute("aria-pressed", "false");
    dom.panToggle.classList.remove("active");
    dom.panToggle.setAttribute("aria-pressed", "false");
    dom.removeAction.classList.add("active");
    dom.removeAction.setAttribute("aria-pressed", "true");
    dom.restoreAction.classList.remove("active");
    dom.restoreAction.setAttribute("aria-pressed", "false");
    dom.brushShapeRound.classList.add("active");
    dom.brushShapeRound.setAttribute("aria-pressed", "true");
    dom.brushShapeSquare.classList.remove("active");
    dom.brushShapeSquare.setAttribute("aria-pressed", "false");

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
    syncCropButtons();
    syncRectButtons();
    clearPreviewPack();
    dom.previewPackStatus.textContent = "Preview pack is empty.";
    clearOverlay(dom, store);
    updatePanUi();
    syncContextControls();
    setStatus("Upload an image to start. Use Studio Cutout for the best general result.");
    renderStage();
}

function setStatus(message) {
    dom.statusCard.textContent = message;
}

function syncFileDetails(file = null, image = null) {
    if (!file || !image) {
        dom.selectedFileName.textContent = "No file selected";
        dom.imageMeta.textContent = "Load a file to enable cutout, cleanup, and export controls.";
        return;
    }

    dom.selectedFileName.textContent = file.name;
    dom.imageMeta.textContent = `${image.naturalWidth} x ${image.naturalHeight} px · ${formatFileSize(file.size)}`;
}

function syncWorkspaceSummary() {
    dom.toolSummary.textContent = getToolLabel(state.cleanupTool);
    dom.actionSummary.textContent = getActionSummary();
    dom.workflowStep.textContent = getWorkflowStepLabel();
}

function capitalize(value) {
    return value.charAt(0).toUpperCase() + value.slice(1);
}

function getToolLabel(tool) {
    if (tool === "brush") {
        return "Brush";
    }
    if (tool === "rect") {
        return "Rectangle";
    }
    if (tool === "crop") {
        return "Crop";
    }
    if (tool === "pan") {
        return "Pan";
    }
    return "Magic Wand";
}

function getActionSummary() {
    if (state.cleanupTool === "brush") {
        return state.editAction === "restore"
            ? `Restore missing subject details with the ${state.brushShape} brush.`
            : `Erase unwanted pixels with the ${state.brushShape} brush.`;
    }

    if (state.cleanupTool === "rect") {
        return state.rectSelection
            ? state.editAction === "restore"
                ? "Rectangle ready to restore that area from the original."
                : "Rectangle ready to remove that selected area."
            : state.editAction === "restore"
                ? "Drag a box to restore a rectangular area."
                : "Drag a box to remove a rectangular background area.";
    }

    if (state.cleanupTool === "crop") {
        return state.cropRect
            ? "Crop box ready. Apply it when the framing looks correct."
            : "Draw a crop box to tighten the composition.";
    }

    if (state.cleanupTool === "pan") {
        return "Move around the canvas without changing pixels.";
    }

    return state.editAction === "restore"
        ? "Restore connected regions from the original image."
        : "Remove connected background regions.";
}

function getWorkflowStepLabel() {
    if (!state.originalImage) {
        return "1. Import an image";
    }

    if (!state.aiCutoutApplied) {
        return "2. Generate a cutout or refine manually";
    }

    if (state.cropRect) {
        return "3. Crop selection ready";
    }

    if (state.rectSelection) {
        return "3. Rectangle selection ready";
    }

    if (state.previewResults.length > 0) {
        return "3. Compare previews and refine";
    }

    return "4. Refine and export";
}

function formatFileSize(bytes) {
    if (bytes < 1024 * 1024) {
        return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function renderViewButtons() {
    dom.viewModeButtons.forEach((button) => {
        button.classList.toggle("active", button.dataset.view === state.viewMode);
    });
}

function syncBrushCursorSize() {
    const size = Number(dom.brushSize.value);
    dom.brushCursor.style.width = `${size}px`;
    dom.brushCursor.style.height = `${size}px`;
    dom.brushCursor.style.marginLeft = `${size / -2}px`;
    dom.brushCursor.style.marginTop = `${size / -2}px`;
    dom.brushCursor.classList.toggle("square", state.brushShape === "square");
    dom.brushCursor.classList.toggle("round", state.brushShape !== "square");
}

dom.qualityValue.textContent = dom.qualityRange.value;
dom.brushSizeValue.textContent = dom.brushSize.value;
dom.wandThresholdValue.textContent = dom.wandThreshold.value;
syncBrushCursorSize();
syncRectButtons();
syncFileDetails();
syncWorkspaceSummary();
renderViewButtons();
updatePanUi();
syncContextControls();
renderStage();
