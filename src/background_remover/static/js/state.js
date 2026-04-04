export function createEditorState() {
    return {
        originalUrl: "",
        originalImage: null,
        workingReady: false,
        aiCutoutApplied: false,
        viewMode: "result",
        cleanupTool: "wand",
        renderRect: null,
        cleanupHistory: [],
        downloadName: "image-no-bg.png",
        hoverSelection: null,
        isBrushing: false,
    };
}
