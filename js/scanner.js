/* Habitat — 3D property scanner.
 *
 * Uses the device camera to capture frames and builds a rough 3D point cloud
 * using frame differencing and motion estimation. Renders the result in a
 * Three.js canvas with orbit controls. Scans are saved per-property in the
 * Store and can be re-loaded, exported as JSON, or deleted.
 *
 * Algorithm: simple motion estimation via frame differencing. For each new
 * frame, compute the per-cell difference from the previous frame. Cells with
 * significant change are treated as feature points; the magnitude of the
 * change is used as a depth proxy (more change → closer to camera). When the
 * camera is nearly static, local texture variance is used as a depth proxy
 * instead. Color is sampled from the current frame. Points accumulate in a
 * cloud rendered as a THREE.Points object.
 */
"use strict";

import { Store } from "./store.js";
import { $, el, esc, btn, field, input, select, toast } from "./ui.js";
import { t } from "./i18n.js";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const MAX_POINTS = 50000;
const FRAME_INTERVAL = 120;
const PROC_WIDTH = 192;
const PROC_HEIGHT = 144;
const GRID_SIZE = 6;
const DIFF_THRESHOLD = 30;
const DEPTH_SCALE = 2.0;
const XY_SCALE = 2.0;

const SCAN_MODES = {
  indoor: { label: "Indoor", depthScale: 1.5, xyScale: 1.5, threshold: 25 },
  outdoor: { label: "Outdoor", depthScale: 3.0, xyScale: 3.0, threshold: 35 },
};

/* ---------------------------------------------------------- frame processing */

function processFrame(prev, curr, width, height) {
  const points = [];
  let totalDiff = 0;
  const pixelCount = curr.data.length / 4;

  for (let i = 0; i < curr.data.length; i += 4) {
    totalDiff += Math.abs(curr.data[i] - prev.data[i]) +
                 Math.abs(curr.data[i + 1] - prev.data[i + 1]) +
                 Math.abs(curr.data[i + 2] - prev.data[i + 2]);
  }
  const avgDiff = totalDiff / pixelCount;
  const isMoving = avgDiff > 5;

  for (let gy = 0; gy < height; gy += GRID_SIZE) {
    for (let gx = 0; gx < width; gx += GRID_SIZE) {
      let diffSum = 0, rSum = 0, gSum = 0, bSum = 0, count = 0;
      let cx = 0, cy = 0;
      let lumSum = 0, lumSqSum = 0;

      for (let y = gy; y < Math.min(gy + GRID_SIZE, height); y++) {
        for (let x = gx; x < Math.min(gx + GRID_SIZE, width); x++) {
          const i = (y * width + x) * 4;
          const d = Math.abs(curr.data[i] - prev.data[i]) +
                    Math.abs(curr.data[i + 1] - prev.data[i + 1]) +
                    Math.abs(curr.data[i + 2] - prev.data[i + 2]);
          diffSum += d;
          rSum += curr.data[i];
          gSum += curr.data[i + 1];
          bSum += curr.data[i + 2];
          cx += x * d;
          cy += y * d;

          const lum = 0.299 * curr.data[i] + 0.587 * curr.data[i + 1] + 0.114 * curr.data[i + 2];
          lumSum += lum;
          lumSqSum += lum * lum;
          count++;
        }
      }

      const cellAvgDiff = diffSum / count;
      const threshold = isMoving ? DIFF_THRESHOLD : DIFF_THRESHOLD * 0.5;

      if (cellAvgDiff > threshold && diffSum > 0) {
        const px = cx / diffSum;
        const py = cy / diffSum;
        const nx = (px / width) * 2 - 1;
        const ny = -((py / height) * 2 - 1);

        let depth;
        if (isMoving) {
          depth = Math.min(1, cellAvgDiff / 250);
        } else {
          const mean = lumSum / count;
          const variance = (lumSqSum / count) - (mean * mean);
          const texture = Math.sqrt(Math.max(0, variance));
          depth = Math.min(1, texture / 60);
        }

        points.push({
          x: nx * XY_SCALE,
          y: ny * XY_SCALE,
          z: (1 - depth) * DEPTH_SCALE,
          r: Math.round(rSum / count),
          g: Math.round(gSum / count),
          b: Math.round(bSum / count),
        });
      }
    }
  }
  return points;
}

/* ------------------------------------------------------------- scanner class */

class Scanner {
  constructor(container, { userId }) {
    this.container = container;
    this.userId = userId;
    this.propertyId = null;
    this.stream = null;
    this.video = null;
    this.canvas = null;
    this.ctx = null;
    this.frameInterval = null;
    this.points = [];
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.pointsObject = null;
    this.animationId = null;
    this.lastFrame = null;
    this.frameCount = 0;
    this.isScanning = false;
    this.destroyed = false;
    this.scanName = "";
    this.scanMode = "indoor";
    this.roomSegments = [];
    this.currentRoom = null;
  }

  async init() {
    this.buildUI();
    try {
      await this.initThree();
    } catch (e) {
      console.error("Three.js init failed", e);
      this.showError(t("webgl_error"));
    }
    this.loadSavedScansList();
  }

  buildUI() {
    const c = this.container;
    c.innerHTML = "";

    // Header
    const hd = el("div", "row-between");
    hd.appendChild(el("h2", null, t("scan_title")));
    c.appendChild(hd);

    // Controls bar
    const bar = el("div", "scan-controls");

    const props = Store.propertiesFor({ id: this.userId, role: "owner" });
    const propSel = select("scanProp", [
      { value: "", label: t("select_property") },
      ...props.map((p) => ({ value: p.id, label: p.name })),
    ]);
    propSel.onchange = () => {
      this.propertyId = propSel.value || null;
      this.stopCamera();
      this.points = [];
      this.updateThreePointCloud();
      this.loadSavedScansList();
      this.autoName();
    };
    bar.appendChild(field("properties", propSel));

    const modeSel = select("scanMode", [
      { value: "indoor", label: t("indoor") || "Indoor" },
      { value: "outdoor", label: t("outdoor") || "Outdoor" },
    ]);
    modeSel.onchange = () => {
      this.scanMode = modeSel.value;
      this.points = [];
      this.updateThreePointCloud();
    };
    bar.appendChild(field("scan_mode", modeSel));

    const nameInput = input("scanName", { placeholder: t("scan_name_ph") });
    nameInput.value = this.scanName;
    nameInput.oninput = () => { this.scanName = nameInput.value; };
    bar.appendChild(field("scan_name", nameInput));

    // Room-by-room controls
    const roomBar = el("div", "scan-room-bar");
    const roomInput = input("roomName", { placeholder: t("room_name_ph") || "Room name (e.g. Living Room)" });
    roomBar.appendChild(field("room_name", roomInput));
    const addRoomBtn = btn(t("add_room") || "Add Room", "btn ghost sm", () => {
      const name = roomInput.value.trim();
      if (!name) return;
      this.currentRoom = name;
      this.roomSegments.push({ name, startFrame: this.frameCount, points: [] });
      toast(t("room_added") || `Room "${name}" started`, "good");
      roomInput.value = "";
    });
    roomBar.appendChild(addRoomBtn);
    c.appendChild(roomBar);

    c.appendChild(bar);

    // Main content: camera preview + 3D view
    const main = el("div", "scan-main");

    // Camera panel
    const camPanel = el("div", "scan-cam-panel");
    const camVideo = el("video");
    camVideo.autoplay = true;
    camVideo.playsInline = true;
    camVideo.muted = true;
    camVideo.className = "scan-video";
    camPanel.appendChild(camVideo);
    this.video = camVideo;

    const camPlaceholder = el("div", "scan-cam-placeholder");
    camPlaceholder.appendChild(el("p", null, t("camera_off")));
    camPanel.appendChild(camPlaceholder);
    this.camPlaceholder = camPlaceholder;

    const camStatus = el("div", "scan-status");
    camPanel.appendChild(camStatus);
    this.camStatus = camStatus;

    main.appendChild(camPanel);

    // 3D panel
    const viewPanel = el("div", "scan-view-panel");
    const viewCanvas = el("canvas");
    viewCanvas.className = "scan-canvas";
    viewPanel.appendChild(viewCanvas);
    this.viewCanvas = viewCanvas;

    const viewOverlay = el("div", "scan-view-overlay");
    viewOverlay.appendChild(el("p", "muted sm", t("no_points_yet")));
    viewPanel.appendChild(viewOverlay);
    this.viewOverlay = viewOverlay;

    main.appendChild(viewPanel);
    c.appendChild(main);

    // Action buttons
    const actions = el("div", "scan-actions");

    const startBtn = btn(t("start_scanning"), "btn", () => this.toggleCamera());
    actions.appendChild(startBtn);
    this.startBtn = startBtn;

    const clearBtn = btn(t("clear"), "btn ghost", () => this.clearPoints());
    clearBtn.disabled = true;
    actions.appendChild(clearBtn);
    this.clearBtn = clearBtn;

    const saveBtn = btn(t("save"), "btn ghost", () => this.saveScan());
    saveBtn.disabled = true;
    actions.appendChild(saveBtn);
    this.saveBtn = saveBtn;

    const exportBtn = btn(t("export"), "btn ghost", () => this.exportScan());
    exportBtn.disabled = true;
    actions.appendChild(exportBtn);
    this.exportBtn = exportBtn;

    const exportObjBtn = btn("OBJ", "btn ghost", () => this.exportScan("obj"));
    exportObjBtn.disabled = true;
    actions.appendChild(exportObjBtn);
    this.exportObjBtn = exportObjBtn;

    const exportPlyBtn = btn("PLY", "btn ghost", () => this.exportScan("ply"));
    exportPlyBtn.disabled = true;
    actions.appendChild(exportPlyBtn);
    this.exportPlyBtn = exportPlyBtn;

    const resetBtn = btn(t("reset_view"), "btn ghost", () => this.resetView());
    actions.appendChild(resetBtn);

    c.appendChild(actions);

    // Saved scans list
    const savedHd = el("h3", null, t("saved_scans"));
    savedHd.setAttribute("data-i18n", "saved_scans");
    c.appendChild(savedHd);

    const savedList = el("div", "scan-saved-list");
    c.appendChild(savedList);
    this.savedList = savedList;
  }

  autoName() {
    if (!this.propertyId) return;
    const prop = Store.property(this.propertyId);
    if (!prop) return;
    const now = new Date();
    const ts = now.toISOString().slice(0, 16).replace("T", " ");
    this.scanName = `${prop.name} — ${ts}`;
    const nameInput = $("input[name=scanName]", this.container);
    if (nameInput) nameInput.value = this.scanName;
  }

  async initThree() {
    const testCanvas = document.createElement("canvas");
    const gl = testCanvas.getContext("webgl") || testCanvas.getContext("experimental-webgl");
    if (!gl) throw new Error("WebGL not supported");

    const canvas = this.viewCanvas;
    const w = canvas.parentElement.clientWidth || 600;
    const h = canvas.parentElement.clientHeight || 400;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x08110e);

    this.camera = new THREE.PerspectiveCamera(60, w / h, 0.01, 100);
    this.camera.position.set(0, 0, 3);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;

    const grid = new THREE.GridHelper(4, 20, 0x1e4232, 0x143026);
    grid.position.y = -1;
    this.scene.add(grid);

    const axes = new THREE.AxesHelper(0.5);
    this.scene.add(axes);

    this.updateThreePointCloud();
    this.animate();

    this.resizeHandler = () => this.onResize();
    window.addEventListener("resize", this.resizeHandler);
  }

  onResize() {
    if (!this.renderer || !this.camera) return;
    const panel = this.viewCanvas.parentElement;
    if (!panel) return;
    const w = panel.clientWidth;
    const h = panel.clientHeight;
    if (w === 0 || h === 0) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  animate() {
    if (this.destroyed) return;
    this.animationId = requestAnimationFrame(() => this.animate());
    if (this.controls) this.controls.update();
    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  async toggleCamera() {
    if (this.isScanning) {
      this.stopCamera();
    } else {
      await this.startCamera();
    }
  }

  async startCamera() {
    if (!this.propertyId) {
      toast(t("select_property"), "bad");
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast(t("camera_unsupported"), "bad");
      return;
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
    } catch (e) {
      console.error("Camera access failed", e);
      toast(t("camera_error"), "bad");
      return;
    }

    this.video.srcObject = this.stream;
    await this.video.play();

    this.canvas = document.createElement("canvas");
    this.canvas.width = PROC_WIDTH;
    this.canvas.height = PROC_HEIGHT;
    this.ctx = this.canvas.getContext("2d", { willReadFrequently: true });

    this.isScanning = true;
    this.lastFrame = null;
    this.frameCount = 0;
    this.startBtn.textContent = t("stop_scanning");
    this.camPlaceholder.hidden = true;
    this.camStatus.textContent = t("scanning");

    this.frameInterval = setInterval(() => this.captureAndProcess(), FRAME_INTERVAL);
  }

  stopCamera() {
    this.isScanning = false;
    if (this.frameInterval) {
      clearInterval(this.frameInterval);
      this.frameInterval = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((tr) => tr.stop());
      this.stream = null;
    }
    if (this.video) {
      this.video.srcObject = null;
    }
    this.startBtn.textContent = t("start_scanning");
    this.camPlaceholder.hidden = false;
    this.camStatus.textContent = "";
    this.saveBtn.disabled = this.points.length === 0;
    this.exportBtn.disabled = this.points.length === 0;
    this.exportObjBtn.disabled = this.points.length === 0;
    this.exportPlyBtn.disabled = this.points.length === 0;
    this.clearBtn.disabled = this.points.length === 0;
  }

  captureAndProcess() {
    if (!this.ctx || !this.video || this.video.readyState < 2) return;

    this.ctx.drawImage(this.video, 0, 0, PROC_WIDTH, PROC_HEIGHT);
    const frameData = this.ctx.getImageData(0, 0, PROC_WIDTH, PROC_HEIGHT);

    if (this.lastFrame) {
      const newPoints = processFrame(this.lastFrame, frameData, PROC_WIDTH, PROC_HEIGHT);
      this.addPoints(newPoints);
    }

    this.lastFrame = frameData;
    this.frameCount++;
    this.camStatus.textContent =
      `${t("scanning")} — ${this.frameCount} ${t("frames")} · ${this.points.length.toLocaleString()} ${t("points")}`;
  }

  addPoints(newPoints) {
    if (!newPoints.length) return;
    this.points.push(...newPoints);
    if (this.points.length > MAX_POINTS) {
      const ratio = MAX_POINTS / this.points.length;
      this.points = this.points.filter(() => Math.random() < ratio);
    }
    this.updateThreePointCloud();
    this.saveBtn.disabled = false;
    this.exportBtn.disabled = false;
    this.exportObjBtn.disabled = false;
    this.exportPlyBtn.disabled = false;
    this.clearBtn.disabled = false;
  }

  updateThreePointCloud() {
    if (!this.scene) return;

    if (this.pointsObject) {
      this.scene.remove(this.pointsObject);
      this.pointsObject.geometry.dispose();
      this.pointsObject.material.dispose();
      this.pointsObject = null;
    }

    if (this.points.length === 0) {
      this.viewOverlay.hidden = false;
      return;
    }

    this.viewOverlay.hidden = true;

    const positions = new Float32Array(this.points.length * 3);
    const colors = new Float32Array(this.points.length * 3);

    for (let i = 0; i < this.points.length; i++) {
      const p = this.points[i];
      positions[i * 3] = p.x;
      positions[i * 3 + 1] = p.y;
      positions[i * 3 + 2] = p.z;
      colors[i * 3] = p.r / 255;
      colors[i * 3 + 1] = p.g / 255;
      colors[i * 3 + 2] = p.b / 255;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.02,
      vertexColors: true,
      sizeAttenuation: true,
    });

    this.pointsObject = new THREE.Points(geometry, material);
    this.scene.add(this.pointsObject);
  }

  async saveScan() {
    if (!this.propertyId) {
      toast(t("select_property"), "bad");
      return;
    }
    if (this.points.length === 0) {
      toast(t("no_points_yet"), "bad");
      return;
    }

    const name = this.scanName.trim() || `${t("scan")} ${new Date().toLocaleString()}`;
    Store.addScan({
      userId: this.userId,
      propertyId: this.propertyId,
      name,
      points: this.points.map((p) => ({
        x: Math.round(p.x * 1000) / 1000,
        y: Math.round(p.y * 1000) / 1000,
        z: Math.round(p.z * 1000) / 1000,
        r: p.r, g: p.g, b: p.b,
      })),
    });

    this.scanName = "";
    const nameInput = $("input[name=scanName]", this.container);
    if (nameInput) nameInput.value = "";

    toast(t("saved"), "good");
    this.loadSavedScansList();
  }

  loadSavedScansList() {
    const list = this.savedList;
    if (!list) return;
    list.innerHTML = "";

    const scans = this.propertyId ? Store.scansFor(this.propertyId) : [];
    if (!scans.length) {
      list.appendChild(el("p", "muted sm", t("no_scans_yet")));
      return;
    }

    scans.forEach((scan) => {
      const row = el("div", "scan-saved-row");
      const info = el("div", "scan-saved-info");
      info.appendChild(el("b", null, scan.name));
      info.appendChild(el("span", "muted xs",
        `${scan.points.length.toLocaleString()} ${t("points")} · ${new Date(scan.createdAt).toLocaleDateString()}`));
      row.appendChild(info);

      const acts = el("div", "card-actions");
      acts.appendChild(btn(t("load"), "btn ghost sm", () => this.loadScan(scan.id)));
      acts.appendChild(btn(t("delete"), "btn ghost sm danger", () => {
        if (!confirm(t("delete_confirm"))) return;
        Store.deleteScan(scan.id, this.userId);
        toast(t("delete"), "info");
        this.loadSavedScansList();
      }));
      row.appendChild(acts);
      list.appendChild(row);
    });
  }

  loadScan(scanId) {
    const scan = Store.scan(scanId);
    if (!scan) return;
    this.points = scan.points.map((p) => ({ ...p }));
    this.propertyId = scan.propertyId;
    this.scanName = scan.name;

    const propSel = $("select[name=scanProp]", this.container);
    if (propSel) propSel.value = scan.propertyId;

    const nameInput = $("input[name=scanName]", this.container);
    if (nameInput) nameInput.value = scan.name;

    this.updateThreePointCloud();
    this.saveBtn.disabled = false;
    this.exportBtn.disabled = false;
    this.exportObjBtn.disabled = false;
    this.exportPlyBtn.disabled = false;
    this.clearBtn.disabled = false;
    toast(t("loaded"), "good");
  }

  clearPoints() {
    if (!confirm(t("clear_confirm"))) return;
    this.points = [];
    this.updateThreePointCloud();
    this.saveBtn.disabled = true;
    this.exportBtn.disabled = true;
    this.exportObjBtn.disabled = true;
    this.exportPlyBtn.disabled = true;
    this.clearBtn.disabled = true;
  }

  resetView() {
    if (!this.camera || !this.controls) return;
    this.camera.position.set(0, 0, 3);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  exportScan(format = "json") {
    if (this.points.length === 0) return;
    const ts = Date.now();
    if (format === "obj") {
      let obj = "# Habitat 3D Scan\n";
      obj += `# ${this.scanName || "scan"} — ${this.points.length} points\n`;
      for (const p of this.points) {
        obj += `v ${p.x.toFixed(4)} ${p.y.toFixed(4)} ${p.z.toFixed(4)} ${(p.r/255).toFixed(4)} ${(p.g/255).toFixed(4)} ${(p.b/255).toFixed(4)}\n`;
      }
      const blob = new Blob([obj], { type: "text/plain" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `habitat-scan-${ts}.obj`;
      a.click();
      URL.revokeObjectURL(a.href);
    } else if (format === "ply") {
      let ply = "ply\n";
      ply += "format ascii 1.0\n";
      ply += `element vertex ${this.points.length}\n`;
      ply += "property float x\nproperty float y\nproperty float z\n";
      ply += "property uchar red\nproperty uchar green\nproperty uchar blue\n";
      ply += "end_header\n";
      for (const p of this.points) {
        ply += `${p.x.toFixed(4)} ${p.y.toFixed(4)} ${p.z.toFixed(4)} ${p.r} ${p.g} ${p.b}\n`;
      }
      const blob = new Blob([ply], { type: "text/plain" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `habitat-scan-${ts}.ply`;
      a.click();
      URL.revokeObjectURL(a.href);
    } else {
      const data = {
        name: this.scanName || "scan",
        exportedAt: new Date().toISOString(),
        pointCount: this.points.length,
        points: this.points,
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `habitat-scan-${ts}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    }
  }

  showError(msg) {
    const c = this.container;
    c.innerHTML = "";
    const err = el("div", "empty");
    err.appendChild(el("p", null, msg));
    c.appendChild(err);
  }

  destroy() {
    this.destroyed = true;
    this.stopCamera();
    if (this.animationId) cancelAnimationFrame(this.animationId);
    if (this.resizeHandler) window.removeEventListener("resize", this.resizeHandler);
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer = null;
    }
    if (this.pointsObject) {
      this.pointsObject.geometry.dispose();
      this.pointsObject.material.dispose();
    }
    this.scene = null;
    this.camera = null;
    this.controls = null;
  }
}

/* -------------------------------------------------------------- factory */

export function createScanner(container, options = {}) {
  const scanner = new Scanner(container, options);
  scanner.init();
  return scanner;
}
