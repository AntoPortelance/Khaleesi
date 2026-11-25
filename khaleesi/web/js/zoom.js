const byId = (id) => document.getElementById(id);

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;
const STEP = 1.25;
const PADDING_PX = 16;
const EMPTY_ASPECT = 16 / 9;

/**
 * Zooms and pans the P&ID only: the page around it stays put, and device labels keep their
 * size so they stay readable. 100% shows the whole diagram; Ctrl + wheel zooms at the pointer,
 * and dragging the background pans once zoomed in.
 */
export class Zoom {
  constructor({ onChange }) {
    this.viewport = byId('pid-viewport');
    this.canvas = byId('pid-canvas');
    this.image = byId('pid-image');
    this.level = byId('zoom-level');
    this.onChange = onChange;
    this.factor = 1;
    this.aspect = EMPTY_ASPECT;

    byId('zoom-in').addEventListener('click', () => this.zoomAt(this.factor * STEP));
    byId('zoom-out').addEventListener('click', () => this.zoomAt(this.factor / STEP));
    byId('zoom-fit').addEventListener('click', () => this.fit());
    this.image.addEventListener('load', () => {
      this.aspect = this.image.naturalWidth / this.image.naturalHeight || EMPTY_ASPECT;
      this.fit();
    });
    new ResizeObserver(() => this.apply()).observe(this.viewport);
    this.viewport.addEventListener('scroll', () => this.onChange());

    this.viewport.addEventListener(
      'wheel',
      (event) => {
        if (!event.ctrlKey && !event.metaKey) return;
        event.preventDefault();
        const factor = this.factor * (event.deltaY < 0 ? STEP : 1 / STEP);
        this.zoomAt(factor, event.clientX, event.clientY);
      },
      { passive: false },
    );
    this.setupPanning();
  }

  setEmptyAspect() {
    this.aspect = EMPTY_ASPECT;
    this.fit();
  }

  fit() {
    this.factor = 1;
    this.apply();
    this.viewport.scrollTo(0, 0);
  }

  /** Zooms while keeping the point under (x, y), or the centre, in place. */
  zoomAt(factor, x, y) {
    const box = this.viewport.getBoundingClientRect();
    const anchorX = x ?? box.left + box.width / 2;
    const anchorY = y ?? box.top + box.height / 2;
    const before = this.canvas.getBoundingClientRect();
    const fractionX = (anchorX - before.left) / before.width;
    const fractionY = (anchorY - before.top) / before.height;

    this.factor = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, factor));
    this.apply();

    const after = this.canvas.getBoundingClientRect();
    this.viewport.scrollLeft += after.left + fractionX * after.width - anchorX;
    this.viewport.scrollTop += after.top + fractionY * after.height - anchorY;
  }

  apply() {
    const width = this.viewport.clientWidth - 2 * PADDING_PX;
    const height = this.viewport.clientHeight - 2 * PADDING_PX;
    if (width <= 0 || height <= 0) return;
    const fitWidth = Math.min(width, height * this.aspect);
    this.canvas.style.width = `${fitWidth * this.factor}px`;
    this.canvas.style.height = `${(fitWidth * this.factor) / this.aspect}px`;
    this.level.textContent = `${Math.round(this.factor * 100)}%`;
    byId('zoom-out').disabled = this.factor <= MIN_ZOOM;
    byId('zoom-in').disabled = this.factor >= MAX_ZOOM;
    this.viewport.classList.toggle('zoomed', this.factor > MIN_ZOOM);
    this.onChange();
  }

  setupPanning() {
    let pan = null;
    this.viewport.addEventListener('pointerdown', (event) => {
      if (this.factor <= MIN_ZOOM || event.button !== 0) return;
      if (event.target.closest('.marker, .zoom, .legend')) return;
      pan = {
        x: event.clientX,
        y: event.clientY,
        left: this.viewport.scrollLeft,
        top: this.viewport.scrollTop,
      };
      this.viewport.setPointerCapture(event.pointerId);
      this.viewport.classList.add('panning');
    });
    this.viewport.addEventListener('pointermove', (event) => {
      if (!pan) return;
      this.viewport.scrollLeft = pan.left - (event.clientX - pan.x);
      this.viewport.scrollTop = pan.top - (event.clientY - pan.y);
    });
    const stop = () => {
      pan = null;
      this.viewport.classList.remove('panning');
    };
    this.viewport.addEventListener('pointerup', stop);
    this.viewport.addEventListener('pointercancel', stop);
  }
}
