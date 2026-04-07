export function buildSelection(store, startX, startY, tolerance) {
    const width = store.workingCanvas.width;
    const height = store.workingCanvas.height;
    if (startX < 0 || startX >= width || startY < 0 || startY >= height) {
        return null;
    }

    const originalData = store.originalContext.getImageData(0, 0, width, height);
    const workingData = store.workingContext.getImageData(0, 0, width, height);
    const source = originalData.data;
    const target = workingData.data;
    const seedIndex = ((startY * width) + startX) * 4;
    if (target[seedIndex + 3] < 12) {
        return null;
    }

    const seedR = source[seedIndex];
    const seedG = source[seedIndex + 1];
    const seedB = source[seedIndex + 2];
    const thresholdSquared = tolerance * tolerance * 3;
    const visited = new Uint8Array(width * height);
    const pixels = [];
    const stack = [startY * width + startX];

    while (stack.length) {
        const current = stack.pop();
        if (current === undefined || visited[current]) {
            continue;
        }
        visited[current] = 1;

        const x = current % width;
        const y = (current - x) / width;
        const pixelIndex = current * 4;
        if (target[pixelIndex + 3] < 12) {
            continue;
        }

        const dr = source[pixelIndex] - seedR;
        const dg = source[pixelIndex + 1] - seedG;
        const db = source[pixelIndex + 2] - seedB;
        const distance = (dr * dr) + (dg * dg) + (db * db);
        if (distance > thresholdSquared) {
            continue;
        }

        pixels.push(current);
        if (x > 0) {
            stack.push(current - 1);
        }
        if (x < width - 1) {
            stack.push(current + 1);
        }
        if (y > 0) {
            stack.push(current - width);
        }
        if (y < height - 1) {
            stack.push(current + width);
        }
    }

    return { width, height, pixels, count: pixels.length };
}

export function applySelection(store, selection) {
    const imageData = store.workingContext.getImageData(
        0,
        0,
        store.workingCanvas.width,
        store.workingCanvas.height,
    );
    for (const pixel of selection.pixels) {
        imageData.data[(pixel * 4) + 3] = 0;
    }
    store.workingContext.putImageData(imageData, 0, 0);
}

export function restoreSelection(store, selection) {
    const originalData = store.originalContext.getImageData(
        0,
        0,
        store.originalCanvas.width,
        store.originalCanvas.height,
    );
    const workingData = store.workingContext.getImageData(
        0,
        0,
        store.workingCanvas.width,
        store.workingCanvas.height,
    );
    for (const pixel of selection.pixels) {
        const index = pixel * 4;
        workingData.data[index] = originalData.data[index];
        workingData.data[index + 1] = originalData.data[index + 1];
        workingData.data[index + 2] = originalData.data[index + 2];
        workingData.data[index + 3] = originalData.data[index + 3];
    }
    store.workingContext.putImageData(workingData, 0, 0);
}

export function paintBrush(store, point, radius) {
    store.workingContext.save();
    store.workingContext.globalCompositeOperation = "destination-out";
    fillBrushShape(store.workingContext, point, radius, "round");
    store.workingContext.restore();
}

export function restoreBrush(store, point, radius, shape = "round") {
    store.workingContext.save();
    clipBrushShape(store.workingContext, point, radius, shape);
    store.workingContext.drawImage(store.originalCanvas, 0, 0);
    store.workingContext.restore();
}

export function eraseBrush(store, point, radius, shape = "round") {
    store.workingContext.save();
    store.workingContext.globalCompositeOperation = "destination-out";
    fillBrushShape(store.workingContext, point, radius, shape);
    store.workingContext.restore();
}

export function applyRectSelection(store, rect) {
    const imageData = store.workingContext.getImageData(
        rect.x,
        rect.y,
        rect.width,
        rect.height,
    );
    for (let index = 3; index < imageData.data.length; index += 4) {
        imageData.data[index] = 0;
    }
    store.workingContext.putImageData(imageData, rect.x, rect.y);
}

export function restoreRectSelection(store, rect) {
    store.workingContext.clearRect(rect.x, rect.y, rect.width, rect.height);
    store.workingContext.drawImage(
        store.originalCanvas,
        rect.x,
        rect.y,
        rect.width,
        rect.height,
        rect.x,
        rect.y,
        rect.width,
        rect.height,
    );
}

function fillBrushShape(context, point, radius, shape) {
    context.beginPath();
    if (shape === "square") {
        context.rect(point.x - radius, point.y - radius, radius * 2, radius * 2);
    } else {
        context.arc(point.x, point.y, radius, 0, Math.PI * 2);
    }
    context.fill();
}

function clipBrushShape(context, point, radius, shape) {
    context.beginPath();
    if (shape === "square") {
        context.rect(point.x - radius, point.y - radius, radius * 2, radius * 2);
    } else {
        context.arc(point.x, point.y, radius, 0, Math.PI * 2);
    }
    context.clip();
}
