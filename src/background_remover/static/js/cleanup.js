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

export function paintBrush(store, point, radius) {
    store.workingContext.save();
    store.workingContext.globalCompositeOperation = "destination-out";
    store.workingContext.beginPath();
    store.workingContext.arc(point.x, point.y, radius, 0, Math.PI * 2);
    store.workingContext.fill();
    store.workingContext.restore();
}
