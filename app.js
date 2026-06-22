const CANVAS_WIDTH = 4500;
const CANVAS_HEIGHT = 5400;
const OUTPUT_SUFFIX = "_4500x5400";
const OUTPUT_SIZE_LIMIT_BYTES = 10_000_000;
const OUTPUT_SIZE_SOFT_TARGET_BYTES = 8_500_000;
const MAX_UPSCALED_DIMENSION = 12_000;
const MAX_UPSCALED_PIXELS = 64_000_000;
const APP_BUILD = "2026-06-22 blue theme 4";
const PICA_UNSHARP_RADIUS = 0.6;
const PICA_UNSHARP_THRESHOLD = 1;

let picaResizer = null;

const state = {
  files: [],
  selectedId: null,
  version: 0,
  processing: false,
};

const elements = {
  fileInput: document.getElementById("fileInput"),
  dropZone: document.getElementById("dropZone"),
  upscaleToggle: document.getElementById("upscaleToggle"),
  upscaleFactor: document.getElementById("upscaleFactor"),
  definitionRange: document.getElementById("definitionRange"),
  definitionValue: document.getElementById("definitionValue"),
  removeBgToggle: document.getElementById("removeBgToggle"),
  toleranceRange: document.getElementById("toleranceRange"),
  toleranceValue: document.getElementById("toleranceValue"),
  edgeCleanupToggle: document.getElementById("edgeCleanupToggle"),
  edgeTrimRange: document.getElementById("edgeTrimRange"),
  edgeTrimValue: document.getElementById("edgeTrimValue"),
  trimToggle: document.getElementById("trimToggle"),
  trimMarginRange: document.getElementById("trimMarginRange"),
  trimMarginValue: document.getElementById("trimMarginValue"),
  repositionToggle: document.getElementById("repositionToggle"),
  paddingRange: document.getElementById("paddingRange"),
  paddingValue: document.getElementById("paddingValue"),
  optimizePngToggle: document.getElementById("optimizePngToggle"),
  buildLabel: document.getElementById("buildLabel"),
  reloadButton: document.getElementById("reloadButton"),
  processButton: document.getElementById("processButton"),
  downloadZipButton: document.getElementById("downloadZipButton"),
  resetButton: document.getElementById("resetButton"),
  clearButton: document.getElementById("clearButton"),
  fileList: document.getElementById("fileList"),
  statusTitle: document.getElementById("statusTitle"),
  progressText: document.getElementById("progressText"),
  progressFill: document.getElementById("progressFill"),
  canvasFrame: document.getElementById("canvasFrame"),
  previewImage: document.getElementById("previewImage"),
  emptyState: document.getElementById("emptyState"),
  previewMeta: document.getElementById("previewMeta"),
  previewColor: document.getElementById("previewColor"),
};

const defaultSettings = {
  upscale: true,
  upscaleFactor: 4,
  definition: 100,
  removeBackground: true,
  tolerance: 0,
  edgeCleanup: true,
  edgeTrim: 4,
  trim: true,
  trimMargin: 0,
  reposition: true,
  padding: 300,
  placement: "top",
  optimizePng: true,
};

function getSettings() {
  return {
    upscale: elements.upscaleToggle.checked,
    upscaleFactor: Number(elements.upscaleFactor.value),
    definition: Number(elements.definitionRange.value),
    removeBackground: elements.removeBgToggle.checked,
    tolerance: Number(elements.toleranceRange.value),
    edgeCleanup: elements.edgeCleanupToggle.checked,
    edgeTrim: Number(elements.edgeTrimRange.value),
    trim: elements.trimToggle.checked,
    trimMargin: Number(elements.trimMarginRange.value),
    reposition: true,
    padding: Number(elements.paddingRange.value),
    placement: document.querySelector("input[name='placement']:checked")?.value ?? "top",
    optimizePng: elements.optimizePngToggle.checked,
  };
}

function setSettings(settings) {
  elements.upscaleToggle.checked = settings.upscale;
  elements.upscaleFactor.value = String(settings.upscaleFactor);
  elements.definitionRange.value = String(settings.definition);
  elements.removeBgToggle.checked = settings.removeBackground;
  elements.toleranceRange.value = String(settings.tolerance);
  elements.edgeCleanupToggle.checked = settings.edgeCleanup;
  elements.edgeTrimRange.value = String(settings.edgeTrim);
  elements.trimToggle.checked = settings.trim;
  elements.trimMarginRange.value = String(settings.trimMargin);
  elements.repositionToggle.checked = true;
  elements.paddingRange.value = String(settings.padding);
  elements.optimizePngToggle.checked = settings.optimizePng;
  const placement = document.querySelector(`input[name="placement"][value="${settings.placement}"]`);
  if (placement) placement.checked = true;
  syncControlLabels();
}

function syncControlLabels() {
  elements.toleranceValue.value = `${elements.toleranceRange.value}%`;
  elements.definitionValue.value = `${elements.definitionRange.value}%`;
  elements.edgeTrimValue.value = elements.edgeTrimRange.value;
  elements.trimMarginValue.value = `${elements.trimMarginRange.value}px`;
  elements.paddingValue.value = `${elements.paddingRange.value}px`;
  elements.upscaleFactor.disabled = !elements.upscaleToggle.checked;
  elements.definitionRange.disabled = false;
  elements.toleranceRange.disabled = !elements.removeBgToggle.checked;
  elements.edgeCleanupToggle.disabled = !elements.removeBgToggle.checked;
  elements.edgeTrimRange.disabled = !elements.removeBgToggle.checked || !elements.edgeCleanupToggle.checked;
  elements.trimMarginRange.disabled = !elements.trimToggle.checked;
  elements.repositionToggle.checked = true;
  elements.repositionToggle.disabled = true;
  elements.paddingRange.disabled = false;
  document
    .querySelectorAll("input[name='placement']")
    .forEach((input) => (input.disabled = false));
  updatePreviewMeta();
}

function getSelectedItem() {
  return state.files.find((file) => file.id === state.selectedId) ?? null;
}

function updatePreviewMeta() {
  const settings = getSettings();
  const item = getSelectedItem();
  const outputWidth = item?.outputWidth ?? CANVAS_WIDTH;
  const outputHeight = item?.outputHeight ?? CANVAS_HEIGHT;
  const details = [
    `Output: ${outputWidth} × ${outputHeight} PNG`,
    `Quality: gentle reduce`,
    `Definition: ${settings.definition}%`,
    `Padding: ${settings.padding}px`,
    `Placement: ${capitalize(settings.placement)}`,
  ];

  if (item?.originalWidth) {
    details.push(`Original: ${item.originalWidth} × ${item.originalHeight}`);
  }
  if (
    item?.upscaledWidth &&
    (item.upscaledWidth !== item.originalWidth || item.upscaledHeight !== item.originalHeight)
  ) {
    details.push(`Upscaled: ${item.upscaledWidth} × ${item.upscaledHeight}`);
  }
  if (item?.trimmedWidth) {
    details.push(`Trimmed art: ${item.trimmedWidth} × ${item.trimmedHeight}`);
  }
  if (item?.placedWidth) {
    details.push(`Placed art: ${item.placedWidth} × ${item.placedHeight}`);
  }
  if (item?.fileSize) {
    details.push(`File: ${formatBytes(item.fileSize)}`);
  }
  if (item?.fileSize > OUTPUT_SIZE_LIMIT_BYTES) {
    details.push(`Over ${formatBytes(OUTPUT_SIZE_LIMIT_BYTES)}`);
  } else if (item?.sizeAdjusted) {
    details.push("Gently reduced");
  }
  if (item?.optimizedPixels) {
    details.push(`Optimized pixels: ${formatNumber(item.optimizedPixels)}`);
  }

  elements.previewMeta.innerHTML = details
    .map((detail) => `<span>${escapeHtml(detail)}</span>`)
    .join("");
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1000)), units.length - 1);
  const value = bytes / 1000 ** exponent;
  return `${value >= 10 || exponent === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[exponent]}`;
}

function formatNumber(value) {
  return new Intl.NumberFormat().format(value);
}

function debounce(callback, wait = 350) {
  let timeout;
  return (...args) => {
    window.clearTimeout(timeout);
    timeout = window.setTimeout(() => callback(...args), wait);
  };
}

const scheduleProcess = debounce(() => {
  if (state.files.length) {
    processAll();
  }
}, 220);

function requestReprocess() {
  if (!state.files.length) return;
  state.version += 1;
  state.files.forEach((item) => {
    item.status = item.id === state.selectedId ? "Updating preview" : "Queued update";
    item.error = "";
    item.warning = "";
    item.processedBlob = null;
    item.fileSize = null;
    item.outputWidth = null;
    item.outputHeight = null;
    item.sizeAdjusted = false;
    item.stale = true;
  });
  renderFileList();
  renderPreview();
  updateStatus();
  scheduleProcess();
}

function setupEvents() {
  elements.buildLabel.textContent = APP_BUILD;

  elements.fileInput.addEventListener("change", (event) => {
    addFiles(event.target.files);
    elements.fileInput.value = "";
  });

  ["dragenter", "dragover"].forEach((eventName) => {
    elements.dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      elements.dropZone.classList.add("dragging");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    elements.dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      elements.dropZone.classList.remove("dragging");
    });
  });

  elements.dropZone.addEventListener("drop", (event) => {
    addFiles(event.dataTransfer.files);
  });

  const settingInputs = [
    elements.upscaleToggle,
    elements.upscaleFactor,
    elements.definitionRange,
    elements.removeBgToggle,
    elements.toleranceRange,
    elements.edgeCleanupToggle,
    elements.edgeTrimRange,
    elements.trimToggle,
    elements.trimMarginRange,
    elements.repositionToggle,
    elements.paddingRange,
    elements.optimizePngToggle,
    ...document.querySelectorAll("input[name='placement']"),
  ];

  settingInputs.forEach((input) => {
    input.addEventListener("input", () => {
      syncControlLabels();
      if (input.type !== "range") {
        requestReprocess();
      }
    });
    input.addEventListener("change", () => {
      syncControlLabels();
      requestReprocess();
    });
  });

  document.querySelectorAll("input[name='previewBg']").forEach((input) => {
    input.addEventListener("change", applyPreviewBackground);
  });
  elements.previewColor.addEventListener("input", applyPreviewBackground);

  elements.processButton.addEventListener("click", () => {
    if (state.files.length) {
      requestReprocess();
    }
  });
  elements.downloadZipButton.addEventListener("click", downloadZip);
  elements.clearButton.addEventListener("click", clearFiles);
  elements.resetButton.addEventListener("click", () => {
    setSettings(defaultSettings);
    requestReprocess();
  });
  elements.reloadButton.addEventListener("click", reloadLatestBuild);
}

function reloadLatestBuild() {
  clearFiles();
  setSettings(defaultSettings);
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch (error) {
    // Some file:// contexts block storage access. Reloading still refreshes the app code.
  }
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set("appReset", Date.now().toString());
  window.location.replace(nextUrl.toString());
}

async function addFiles(fileList) {
  const files = Array.from(fileList).filter((file) => file.type.startsWith("image/"));
  if (!files.length) return;

  const usedOutputNames = new Set(state.files.map((item) => item.outputName));
  const addedItems = files.map((file) => {
    const id = crypto.randomUUID();
    const outputName = makeUniqueOutputName(file.name, usedOutputNames);
    usedOutputNames.add(outputName);
    return {
      id,
      file,
      name: file.name,
      outputName,
      originalWidth: null,
      originalHeight: null,
      status: "Queued",
      error: "",
      warning: "",
      processedBlob: null,
      previewUrl: "",
      thumbUrl: URL.createObjectURL(file),
      upscaledWidth: null,
      upscaledHeight: null,
      trimmedWidth: null,
      trimmedHeight: null,
      placedWidth: null,
      placedHeight: null,
      fileSize: null,
      outputWidth: null,
      outputHeight: null,
      sizeAdjusted: false,
      optimizedPixels: null,
      stale: false,
    };
  });

  state.files.push(...addedItems);
  state.selectedId = state.selectedId ?? addedItems[0].id;
  renderFileList();
  updateStatus();
  await processAll();
}

function makeOutputName(name) {
  const dotIndex = name.lastIndexOf(".");
  const base = dotIndex > 0 ? name.slice(0, dotIndex) : name;
  return `${sanitizeFilename(base)}${OUTPUT_SUFFIX}.png`;
}

function makeUniqueOutputName(name, usedNames) {
  const outputName = makeOutputName(name);
  if (!usedNames.has(outputName)) return outputName;

  const dotIndex = outputName.lastIndexOf(".");
  const base = dotIndex > 0 ? outputName.slice(0, dotIndex) : outputName;
  const extension = dotIndex > 0 ? outputName.slice(dotIndex) : "";
  let index = 2;
  let candidate = `${base}_${index}${extension}`;

  while (usedNames.has(candidate)) {
    index += 1;
    candidate = `${base}_${index}${extension}`;
  }

  return candidate;
}

function sanitizeFilename(name) {
  return name.trim().replace(/[\\/:*?"<>|]+/g, "-") || "image";
}

async function processAll() {
  if (!state.files.length || state.processing) {
    if (state.processing) scheduleProcess();
    return;
  }

  state.processing = true;
  const version = ++state.version;
  elements.processButton.disabled = true;
  elements.downloadZipButton.disabled = true;
  elements.statusTitle.textContent = "Processing images";

  const settings = getSettings();
  let completed = 0;
  const orderedFiles = getProcessingOrder();

  for (const item of orderedFiles) {
    if (version !== state.version) break;
    item.status = "Processing";
    item.error = "";
    item.warning = "";
    renderFileList();
    updateProgress(completed, state.files.length);

    try {
      const result = await processImage(item.file, settings);
      if (version !== state.version) break;
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      item.previewUrl = URL.createObjectURL(result.blob);
      item.processedBlob = result.blob;
      item.originalWidth = result.originalWidth;
      item.originalHeight = result.originalHeight;
      item.upscaledWidth = result.upscaledWidth;
      item.upscaledHeight = result.upscaledHeight;
      item.trimmedWidth = result.trimmedWidth;
      item.trimmedHeight = result.trimmedHeight;
      item.placedWidth = result.placedWidth;
      item.placedHeight = result.placedHeight;
      item.fileSize = result.blob.size;
      item.outputWidth = result.outputWidth;
      item.outputHeight = result.outputHeight;
      item.sizeAdjusted = result.sizeAdjusted;
      item.optimizedPixels = result.optimizedPixels;
      item.status = "Ready";
      item.warning = result.warning;
      item.stale = false;
    } catch (error) {
      item.status = "Error";
      item.error = error instanceof Error ? error.message : "Could not process this file.";
      item.processedBlob = null;
      if (item.previewUrl) {
        URL.revokeObjectURL(item.previewUrl);
        item.previewUrl = "";
      }
      item.fileSize = null;
      item.outputWidth = null;
      item.outputHeight = null;
      item.sizeAdjusted = false;
      item.optimizedPixels = null;
      item.stale = false;
    }

    completed += 1;
    renderFileList();
    renderPreview();
    updateProgress(completed, state.files.length);
    await waitForPaint();
  }

  state.processing = false;
  elements.processButton.disabled = false;
  updateStatus();
  renderPreview();
}

function getProcessingOrder() {
  const selected = getSelectedItem();
  if (!selected) return [...state.files];
  return [selected, ...state.files.filter((item) => item.id !== selected.id)];
}

function waitForPaint() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

async function processImage(file, settings) {
  const bitmap = await createImageBitmap(file);
  const originalWidth = bitmap.width;
  const originalHeight = bitmap.height;
  let upscaledWidth = originalWidth;
  let upscaledHeight = originalHeight;
  let source = createCanvas(bitmap.width, bitmap.height);
  let sourceContext = source.getContext("2d", { willReadFrequently: true });
  sourceContext.drawImage(bitmap, 0, 0);
  bitmap.close();

  let sampledColors = [];
  if (settings.removeBackground) {
    const imageData = sourceContext.getImageData(0, 0, source.width, source.height);
    sampledColors = sampleCornerColors(imageData, source.width, source.height);
    const removalThreshold = getRemovalThreshold(settings.tolerance);
    removeSampledColorsGlobally(imageData, source.width, source.height, sampledColors, removalThreshold);
    if (settings.edgeCleanup) {
      cleanupEdgeHaze(imageData, source.width, source.height, sampledColors, removalThreshold);
      trimBackgroundColorEdges(
        imageData,
        source.width,
        source.height,
        sampledColors,
        removalThreshold,
        settings.edgeTrim,
      );
    }
    sourceContext.putImageData(imageData, 0, 0);
  }

  if (settings.trim) {
    source = trimTransparentPixels(source, settings.trimMargin);
  }
  const trimmedWidth = source.width;
  const trimmedHeight = source.height;

  if (settings.upscale) {
    const scale = getUpscaleScale(source.width, source.height, settings.upscaleFactor);
    if (scale > 1.01) {
      const nextWidth = Math.max(1, Math.round(source.width * scale));
      const nextHeight = Math.max(1, Math.round(source.height * scale));
      source = await resizeCanvas(source, nextWidth, nextHeight, Math.round(settings.definition * 0.65));
    }
  }
  upscaledWidth = source.width;
  upscaledHeight = source.height;

  const placementDetails = await placeOnAmazonCanvas(
    source,
    settings.padding,
    settings.placement,
    settings.definition,
  );
  const output = placementDetails.canvas;
  const placementBounds = getPlacementBounds(placementDetails);
  let optimizedPixels = settings.optimizePng ? normalizeTransparentPixels(output, placementBounds) : 0;
  const exportResult = await exportPngWithinSize(output, placementBounds, settings.optimizePng);
  optimizedPixels += exportResult.optimizedPixels;
  const warning = makeQualityWarning(
    exportResult.canvas,
    originalWidth,
    originalHeight,
    exportResult.sizeAdjusted,
    exportResult.overLimit,
  );
  return {
    blob: exportResult.blob,
    originalWidth,
    originalHeight,
    upscaledWidth,
    upscaledHeight,
    trimmedWidth,
    trimmedHeight,
    outputWidth: exportResult.canvas.width,
    outputHeight: exportResult.canvas.height,
    placedWidth: placementDetails.placedWidth,
    placedHeight: placementDetails.placedHeight,
    sizeAdjusted: exportResult.sizeAdjusted,
    optimizedPixels,
    warning,
    sampledColors,
  };
}

function getUpscaleScale(width, height, requestedScale) {
  const dimensionScale = MAX_UPSCALED_DIMENSION / Math.max(width, height);
  const pixelScale = Math.sqrt(MAX_UPSCALED_PIXELS / Math.max(1, width * height));
  return Math.max(1, Math.min(requestedScale, dimensionScale, pixelScale));
}

function createCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function resizeCanvas(source, targetWidth, targetHeight, definition = 0) {
  const resizer = getPicaResizer();
  if (resizer) {
    const canvas = createCanvas(targetWidth, targetHeight);
    try {
      await resizer.resize(source, canvas, {
        filter: "mks2013",
        unsharpAmount: definitionToUnsharpAmount(definition),
        unsharpRadius: PICA_UNSHARP_RADIUS,
        unsharpThreshold: PICA_UNSHARP_THRESHOLD,
      });
      return canvas;
    } catch (error) {
      console.warn("High-quality resize unavailable. Falling back to canvas resize.", error);
    }
  }

  const canvas = resizeCanvasFallback(source, targetWidth, targetHeight);
  if (definition > 0) {
    enhanceCanvasDefinition(canvas, definition);
  }
  return canvas;
}

function getPicaResizer() {
  if (typeof window.pica !== "function") return null;
  if (!picaResizer) {
    picaResizer = window.pica({
      features: ["js", "wasm", "ww"],
      tile: 1024,
      idle: 4000,
    });
  }
  return picaResizer;
}

function definitionToUnsharpAmount(definition) {
  if (definition <= 0) return 0;
  return Math.round(40 + clamp(definition, 0, 100) * 1.6);
}

function resizeCanvasFallback(source, targetWidth, targetHeight) {
  let current = source;
  while (current.width * 1.6 < targetWidth || current.height * 1.6 < targetHeight) {
    const width = Math.min(targetWidth, Math.round(current.width * 1.6));
    const height = Math.min(targetHeight, Math.round(current.height * 1.6));
    current = drawResized(current, width, height);
  }
  return drawResized(current, targetWidth, targetHeight);
}

function drawResized(source, width, height) {
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, 0, 0, width, height);
  return canvas;
}

function enhanceCanvasDefinition(canvas, definition) {
  sharpenCanvas(canvas, 0.08 + clamp(definition, 0, 100) * 0.0032);
}

function sharpenCanvas(canvas, amount) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const copy = new Uint8ClampedArray(data);
  const width = canvas.width;
  const height = canvas.height;
  const center = 1 + 4 * amount;
  const side = -amount;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = (y * width + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        const value =
          copy[index + channel] * center +
          copy[index - 4 + channel] * side +
          copy[index + 4 + channel] * side +
          copy[index - width * 4 + channel] * side +
          copy[index + width * 4 + channel] * side;
        data[index + channel] = clamp(value, 0, 255);
      }
    }
  }

  context.putImageData(imageData, 0, 0);
}

function sampleCornerColors(imageData, width, height) {
  const radius = Math.max(2, Math.min(24, Math.floor(Math.min(width, height) * 0.025)));
  const corners = [
    [0, 0],
    [width - radius, 0],
    [0, height - radius],
    [width - radius, height - radius],
  ];

  return corners
    .map(([startX, startY]) => averageColor(imageData.data, width, height, startX, startY, radius))
    .filter(Boolean);
}

function averageColor(data, width, height, startX, startY, size) {
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  const endX = Math.min(width, startX + size);
  const endY = Math.min(height, startY + size);

  for (let y = Math.max(0, startY); y < endY; y += 1) {
    for (let x = Math.max(0, startX); x < endX; x += 1) {
      const index = (y * width + x) * 4;
      const alpha = data[index + 3];
      if (alpha > 12) {
        r += data[index];
        g += data[index + 1];
        b += data[index + 2];
        count += 1;
      }
    }
  }

  if (!count) return null;
  return {
    r: Math.round(r / count),
    g: Math.round(g / count),
    b: Math.round(b / count),
  };
}

function getRemovalThreshold(recovery) {
  return Math.max(2, Math.round(56 - recovery * 0.54));
}

function removeSampledColorsGlobally(imageData, width, height, colors, removalThreshold) {
  if (!colors.length) return;
  const data = imageData.data;
  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] > 0 && isNearAnyColor(data, index, colors, removalThreshold)) {
      data[index + 3] = 0;
    }
  }
}

function cleanupEdgeHaze(imageData, width, height, colors, removalThreshold) {
  if (!colors.length) return;
  const data = imageData.data;
  const copy = new Uint8ClampedArray(data);
  const hazeThreshold = Math.max(8, removalThreshold + 14);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      const index = pixel * 4;
      const alpha = copy[index + 3];
      if (!alpha) continue;

      if (alpha < 18) {
        data[index + 3] = 0;
        continue;
      }

      if (!isNearAnyColor(copy, index, colors, hazeThreshold)) continue;
      if (touchesTransparent(copy, width, height, x, y)) {
        data[index + 3] = 0;
      }
    }
  }
}

function trimBackgroundColorEdges(imageData, width, height, colors, removalThreshold, amount) {
  if (!colors.length || amount <= 0) return;
  const data = imageData.data;
  const edgeThreshold = Math.min(112, removalThreshold + 10 + amount * 2);
  const queued = new Uint8Array(width * height);
  const queue = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      const index = pixel * 4;
      if (
        isRemovableEdgeColor(data, index, colors, edgeThreshold) &&
        touchesTransparent(data, width, height, x, y)
      ) {
        queued[pixel] = 1;
        queue.push(pixel);
      }
    }
  }

  let readIndex = 0;
  for (let pass = 0; pass < amount && readIndex < queue.length; pass += 1) {
    const passEnd = queue.length;

    for (; readIndex < passEnd; readIndex += 1) {
      const pixel = queue[readIndex];
      const index = pixel * 4;
      if (!isRemovableEdgeColor(data, index, colors, edgeThreshold)) continue;

      data[index] = 0;
      data[index + 1] = 0;
      data[index + 2] = 0;
      data[index + 3] = 0;

      const x = pixel % width;
      const y = Math.floor(pixel / width);

      enqueueRemovableNeighborEdges(data, width, height, x, y, colors, edgeThreshold, queued, queue);
    }
  }
}

function isRemovableEdgeColor(data, index, colors, edgeThreshold) {
  const alpha = data[index + 3];
  return alpha > 0 && (alpha < 24 || isNearAnyColor(data, index, colors, edgeThreshold));
}

function enqueueRemovableNeighborEdges(data, width, height, x, y, colors, edgeThreshold, queued, queue) {
  for (let yy = y - 1; yy <= y + 1; yy += 1) {
    for (let xx = x - 1; xx <= x + 1; xx += 1) {
      if (xx < 0 || yy < 0 || xx >= width || yy >= height || (xx === x && yy === y)) continue;

      const pixel = yy * width + xx;
      if (queued[pixel]) continue;

      const index = pixel * 4;
      if (isRemovableEdgeColor(data, index, colors, edgeThreshold)) {
        queued[pixel] = 1;
        queue.push(pixel);
      }
    }
  }
}

function touchesTransparent(data, width, height, x, y) {
  for (let yy = y - 1; yy <= y + 1; yy += 1) {
    for (let xx = x - 1; xx <= x + 1; xx += 1) {
      if (xx < 0 || yy < 0 || xx >= width || yy >= height || (xx === x && yy === y)) continue;
      if (data[(yy * width + xx) * 4 + 3] === 0) return true;
    }
  }
  return false;
}

function isNearAnyColor(data, index, colors, tolerance) {
  return colors.some((color) => colorDistance(data, index, color) <= tolerance);
}

function colorDistance(data, index, color) {
  const r = data[index] - color.r;
  const g = data[index + 1] - color.g;
  const b = data[index + 2] - color.b;
  return Math.sqrt(r * r + g * g + b * b);
}

function findVisiblePixelBounds(source, alphaThreshold = 10) {
  const context = source.getContext("2d", { willReadFrequently: true });
  const imageData = context.getImageData(0, 0, source.width, source.height);
  const data = imageData.data;
  let minX = source.width;
  let minY = source.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const alpha = data[(y * source.width + x) * 4 + 3];
      if (alpha > alphaThreshold) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return null;
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

function trimTransparentPixels(source, margin) {
  const bounds = findVisiblePixelBounds(source);

  if (!bounds) {
    return createCanvas(1, 1);
  }

  const minX = Math.max(0, bounds.minX - margin);
  const minY = Math.max(0, bounds.minY - margin);
  const maxX = Math.min(source.width - 1, bounds.maxX + margin);
  const maxY = Math.min(source.height - 1, bounds.maxY + margin);

  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  const trimmed = createCanvas(width, height);
  const trimmedContext = trimmed.getContext("2d");
  trimmedContext.drawImage(source, minX, minY, width, height, 0, 0, width, height);
  return trimmed;
}

async function placeOnAmazonCanvas(source, padding, placement, definition) {
  const output = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
  const context = output.getContext("2d");
  context.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  const safeWidth = Math.max(1, CANVAS_WIDTH - padding * 2);
  const safeHeight = Math.max(1, CANVAS_HEIGHT - padding * 2);
  const scale = Math.min(safeWidth / source.width, safeHeight / source.height);
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const x = Math.round((CANVAS_WIDTH - width) / 2);
  let y = padding;

  if (placement === "middle") {
    y = Math.round((CANVAS_HEIGHT - height) / 2);
  } else if (placement === "bottom") {
    y = Math.round(CANVAS_HEIGHT - padding - height);
  }

  let placedSource = source;
  if (source.width !== width || source.height !== height) {
    placedSource = await resizeCanvas(source, width, height, definition);
  } else if (definition > 0) {
    placedSource = cloneCanvas(source);
    enhanceCanvasDefinition(placedSource, definition);
  }

  context.drawImage(placedSource, x, y);
  return {
    canvas: output,
    placedWidth: width,
    placedHeight: height,
    x,
    y,
  };
}

function getPlacementBounds(placementDetails) {
  const minX = clamp(Math.floor(placementDetails.x), 0, CANVAS_WIDTH - 1);
  const minY = clamp(Math.floor(placementDetails.y), 0, CANVAS_HEIGHT - 1);
  const maxX = clamp(Math.ceil(placementDetails.x + placementDetails.placedWidth), 0, CANVAS_WIDTH);
  const maxY = clamp(Math.ceil(placementDetails.y + placementDetails.placedHeight), 0, CANVAS_HEIGHT);

  return {
    minX,
    minY,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY),
  };
}

function normalizeTransparentPixels(canvas, bounds = null) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const area = bounds ?? {
    minX: 0,
    minY: 0,
    width: canvas.width,
    height: canvas.height,
  };
  if (!area.width || !area.height) return 0;

  const imageData = context.getImageData(area.minX, area.minY, area.width, area.height);
  const data = imageData.data;
  let cleaned = 0;

  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] !== 0) continue;
    if (data[index] || data[index + 1] || data[index + 2]) {
      data[index] = 0;
      data[index + 1] = 0;
      data[index + 2] = 0;
      cleaned += 1;
    }
  }

  if (cleaned) {
    context.putImageData(imageData, area.minX, area.minY);
  }
  return cleaned;
}

async function exportPngWithinSize(canvas, placementBounds, shouldOptimize) {
  let blob = await canvasToBlob(canvas);
  let output = canvas;
  let optimizedPixels = 0;
  let sizeAdjusted = false;

  if (shouldOptimize && blob.size > OUTPUT_SIZE_LIMIT_BYTES) {
    const candidates = [
      gentlyReducePngComplexity(canvas, placementBounds, 4, false),
      gentlyReducePngComplexity(canvas, placementBounds, 6, true),
    ];

    for (const candidate of candidates) {
      const candidateBlob = await canvasToBlob(candidate.canvas);
      if (candidateBlob.size < blob.size) {
        output = candidate.canvas;
        blob = candidateBlob;
        optimizedPixels = candidate.adjustedPixels;
        sizeAdjusted = true;
      }
      if (blob.size <= OUTPUT_SIZE_LIMIT_BYTES && blob.size >= OUTPUT_SIZE_SOFT_TARGET_BYTES) break;
    }
  }

  return {
    blob,
    canvas: output,
    sizeAdjusted,
    optimizedPixels,
    overLimit: blob.size > OUTPUT_SIZE_LIMIT_BYTES,
  };
}

function gentlyReducePngComplexity(source, bounds, colorStep, simplifyAlpha) {
  const canvas = cloneCanvas(source);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const area = bounds ?? {
    minX: 0,
    minY: 0,
    width: canvas.width,
    height: canvas.height,
  };
  const imageData = context.getImageData(area.minX, area.minY, area.width, area.height);
  const data = imageData.data;
  let adjustedPixels = 0;

  for (let index = 0; index < data.length; index += 4) {
    const alpha = data[index + 3];
    if (!alpha) continue;

    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    const a = alpha;

    data[index] = quantizeChannel(r, colorStep);
    data[index + 1] = quantizeChannel(g, colorStep);
    data[index + 2] = quantizeChannel(b, colorStep);

    if (simplifyAlpha) {
      if (alpha < 12) data[index + 3] = 0;
      else if (alpha > 243) data[index + 3] = 255;
    }

    if (data[index] !== r || data[index + 1] !== g || data[index + 2] !== b || data[index + 3] !== a) {
      adjustedPixels += 1;
    }
  }

  if (adjustedPixels) {
    context.putImageData(imageData, area.minX, area.minY);
  }

  return {
    canvas,
    adjustedPixels,
  };
}

function cloneCanvas(source) {
  const canvas = createCanvas(source.width, source.height);
  const context = canvas.getContext("2d");
  context.drawImage(source, 0, 0);
  return canvas;
}

function quantizeChannel(value, step) {
  return clamp(Math.round(value / step) * step, 0, 255);
}

function makeQualityWarning(output, originalWidth, originalHeight, sizeAdjusted, overLimit) {
  const warnings = [];

  if (overLimit) {
    warnings.push(`Over ${formatBytes(OUTPUT_SIZE_LIMIT_BYTES)}. Gentle reduction kept quality.`);
  } else if (sizeAdjusted) {
    warnings.push("Gently reduced PNG size.");
  } else if (output.width !== CANVAS_WIDTH || output.height !== CANVAS_HEIGHT) {
    warnings.push("Export is not on the Amazon canvas.");
  }
  if (originalWidth < 1500 || originalHeight < 1500) {
    warnings.push("Small source image. Upscale may help.");
  }

  return warnings.join(" ");
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Could not create PNG."));
      },
      "image/png",
      1,
    );
  });
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function clearFiles() {
  state.files.forEach((item) => {
    URL.revokeObjectURL(item.thumbUrl);
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
  });
  state.files = [];
  state.selectedId = null;
  state.version += 1;
  renderFileList();
  renderPreview();
  updateStatus();
}

function renderFileList() {
  if (!state.files.length) {
    elements.fileList.innerHTML = `<div class="queue-empty">Your uploaded images will appear here.</div>`;
    return;
  }

  elements.fileList.innerHTML = "";
  state.files.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `file-item${item.id === state.selectedId ? " selected" : ""}${item.stale ? " stale" : ""}`;
    button.addEventListener("click", () => {
      state.selectedId = item.id;
      renderFileList();
      renderPreview();
    });

    const statusClass = item.error ? "error" : item.warning ? "warning" : item.stale ? "warning" : "";
    const sizeText = item.fileSize ? ` • ${formatBytes(item.fileSize)}` : "";
    const hasUpscaleSize =
      item.upscaledWidth &&
      (item.upscaledWidth !== item.originalWidth || item.upscaledHeight !== item.originalHeight);
    const dimensionText = item.originalWidth
      ? `${item.originalWidth} × ${item.originalHeight}${hasUpscaleSize ? ` → ${item.upscaledWidth} × ${item.upscaledHeight}` : ""}`
      : "Reading image";
    button.innerHTML = `
      <span class="file-thumb checker-bg">
        <img src="${item.previewUrl || item.thumbUrl}" alt="" />
      </span>
      <span class="file-info">
        <span class="file-name" title="${escapeHtml(item.outputName)}">${escapeHtml(item.outputName)}</span>
        <span class="file-meta">${escapeHtml(dimensionText)}${escapeHtml(sizeText)}</span>
        <span class="file-status ${statusClass}">${escapeHtml(item.error || item.warning || item.status)}</span>
      </span>
    `;
    elements.fileList.append(button);
  });
}

function renderPreview() {
  const item = getSelectedItem();
  if (!item || !item.previewUrl) {
    elements.previewImage.removeAttribute("src");
    elements.previewImage.alt = "";
    elements.canvasFrame.classList.remove("has-image");
    elements.canvasFrame.classList.remove("preview-stale");
    updatePreviewMeta();
    return;
  }
  elements.previewImage.src = item.previewUrl;
  elements.previewImage.alt = `Preview of ${item.outputName}`;
  elements.canvasFrame.classList.add("has-image");
  elements.canvasFrame.classList.toggle("preview-stale", item.stale);
  updatePreviewMeta();
}

function updateStatus() {
  const total = state.files.length;
  const ready = state.files.filter((item) => item.processedBlob).length;
  const errors = state.files.filter((item) => item.error).length;

  elements.statusTitle.textContent = total ? `${ready} of ${total} ready` : "Ready for images";
  elements.progressText.textContent = total ? `${ready}/${total} processed` : "0 files";
  elements.progressFill.style.width = total ? `${Math.round((ready / total) * 100)}%` : "0%";
  elements.downloadZipButton.disabled = ready === 0 || state.processing;
  elements.downloadZipButton.textContent = ready > 1 ? "Download ZIP" : ready === 1 ? "Download PNG" : "Download";

  if (errors) {
    elements.statusTitle.textContent += `, ${errors} failed`;
  }
  updatePreviewMeta();
}

function updateProgress(completed, total) {
  elements.progressText.textContent = `${completed}/${total} processed`;
  elements.progressFill.style.width = total ? `${Math.round((completed / total) * 100)}%` : "0%";
}

function applyPreviewBackground() {
  const value = document.querySelector("input[name='previewBg']:checked")?.value ?? "checker";
  elements.canvasFrame.classList.toggle("checker-bg", value === "checker");

  if (value === "white") {
    elements.canvasFrame.style.backgroundColor = "#ffffff";
  } else if (value === "black") {
    elements.canvasFrame.style.backgroundColor = "#111111";
  } else if (value === "custom") {
    elements.canvasFrame.style.backgroundColor = elements.previewColor.value;
  } else {
    elements.canvasFrame.style.backgroundColor = "";
  }
}

async function downloadZip() {
  const readyFiles = state.files.filter((item) => item.processedBlob);
  if (!readyFiles.length) return;

  elements.downloadZipButton.disabled = true;
  elements.downloadZipButton.textContent = "Preparing";

  try {
    if (readyFiles.length === 1) {
      downloadBlob(readyFiles[0].processedBlob, readyFiles[0].outputName);
      return;
    }

    const entries = [];
    for (const item of readyFiles) {
      entries.push({
        name: item.outputName,
        bytes: new Uint8Array(await item.processedBlob.arrayBuffer()),
      });
    }
    const zipBlob = createZip(entries);
    downloadBlob(zipBlob, `pro-prep-images_${CANVAS_WIDTH}x${CANVAS_HEIGHT}.zip`);
  } finally {
    elements.downloadZipButton.textContent = "Download";
    updateStatus();
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function createZip(entries) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  entries.forEach((entry) => {
    const nameBytes = encoder.encode(entry.name);
    const crc = crc32(entry.bytes);
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    writeLocalHeader(localView, nameBytes, crc, entry.bytes.length);
    localHeader.set(nameBytes, 30);
    localParts.push(localHeader, entry.bytes);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    writeCentralHeader(centralView, nameBytes, crc, entry.bytes.length, offset);
    centralHeader.set(nameBytes, 46);
    centralParts.push(centralHeader);

    offset += localHeader.length + entry.bytes.length;
  });

  const centralOffset = offset;
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, centralOffset, true);

  return new Blob([...localParts, ...centralParts, end], { type: "application/zip" });
}

function writeLocalHeader(view, nameBytes, crc, size) {
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 0x0800, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, 0, true);
  view.setUint32(14, crc, true);
  view.setUint32(18, size, true);
  view.setUint32(22, size, true);
  view.setUint16(26, nameBytes.length, true);
  view.setUint16(28, 0, true);
}

function writeCentralHeader(view, nameBytes, crc, size, offset) {
  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 20, true);
  view.setUint16(8, 0x0800, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, 0, true);
  view.setUint16(14, 0, true);
  view.setUint32(16, crc, true);
  view.setUint32(20, size, true);
  view.setUint32(24, size, true);
  view.setUint16(28, nameBytes.length, true);
  view.setUint16(30, 0, true);
  view.setUint16(32, 0, true);
  view.setUint16(34, 0, true);
  view.setUint16(36, 0, true);
  view.setUint32(38, 0, true);
  view.setUint32(42, offset, true);
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let j = 0; j < 8; j += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

setSettings(defaultSettings);
setupEvents();
applyPreviewBackground();
renderFileList();
renderPreview();
updateStatus();
