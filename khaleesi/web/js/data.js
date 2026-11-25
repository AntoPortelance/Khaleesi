import { describeReading, formatRange, formatValue } from './format.js';

const byId = (id) => document.getElementById(id);
const WINDOW_MS = 60000;
const SPARK_WIDTH = 220;
const SPARK_HEIGHT = 36;

/** Data tabs: every sensor of every control tab, with its value and its last minute. */
export class DataView {
  constructor(state) {
    this.state = state;
    this.rows = byId('data-rows');
    this.lastDraw = 0;
  }

  render() {
    const sensors = [...this.state.sensors.values()];
    const tabOrder = new Map(this.state.tabs.map((tab, index) => [tab.id, index]));
    sensors.sort(
      (a, b) =>
        (tabOrder.get(a.tab_id) ?? 0) - (tabOrder.get(b.tab_id) ?? 0) ||
        a.name.localeCompare(b.name),
    );
    byId('data-empty').hidden = sensors.length > 0;
    this.rows.closest('table').hidden = sensors.length === 0;
    this.rows.replaceChildren(...sensors.map((sensor) => this.createRow(sensor)));
    this.renderLive(true);
  }

  createRow(sensor) {
    const row = document.createElement('tr');
    row.dataset.id = sensor.id;
    const cells = ['name', 'tab', 'value', 'range', 'trend'].map((name) => {
      const cell = document.createElement('td');
      cell.className = `cell-${name}`;
      row.append(cell);
      return cell;
    });
    cells[0].textContent = sensor.name;
    cells[1].textContent = this.state.tab(sensor.tab_id)?.name ?? '';
    cells[2].classList.add('numeric');
    cells[3].textContent = sensor.kind === 'analog' ? formatRange(sensor) : 'ON / OFF';
    const canvas = document.createElement('canvas');
    canvas.width = SPARK_WIDTH * window.devicePixelRatio;
    canvas.height = SPARK_HEIGHT * window.devicePixelRatio;
    canvas.style.width = `${SPARK_WIDTH}px`;
    canvas.style.height = `${SPARK_HEIGHT}px`;
    cells[4].append(canvas);
    return row;
  }

  /** Values follow every reading; the small graphs are redrawn twice per second. */
  renderLive(force = false) {
    const now = Date.now();
    const drawGraphs = force || now - this.lastDraw > 500;
    if (drawGraphs) this.lastDraw = now;
    for (const row of this.rows.children) {
      const sensor = this.state.sensors.get(row.dataset.id);
      if (!sensor) continue;
      const reading = this.state.live.get(sensor.id);
      const value = row.querySelector('.cell-value');
      value.textContent = formatValue(sensor, reading?.value);
      value.dataset.tone = describeReading(reading).tone;
      if (drawGraphs) this.drawGraph(row.querySelector('canvas'), sensor, now);
    }
  }

  drawGraph(canvas, sensor, now) {
    const context = canvas.getContext('2d');
    const scale = window.devicePixelRatio;
    context.setTransform(scale, 0, 0, scale, 0, 0);
    context.clearRect(0, 0, SPARK_WIDTH, SPARK_HEIGHT);
    const points = this.state.live.points(sensor.id);
    if (points.length < 2) return;

    const values = points.map(([, value]) => value);
    let low = Math.min(...values, sensor.min ?? Infinity);
    let high = Math.max(...values, sensor.max ?? -Infinity);
    if (high - low < 1e-9) {
      low -= 1;
      high += 1;
    }
    const x = (time) => ((time - (now - WINDOW_MS)) / WINDOW_MS) * SPARK_WIDTH;
    const y = (value) => SPARK_HEIGHT - 3 - ((value - low) / (high - low)) * (SPARK_HEIGHT - 6);
    const styles = getComputedStyle(document.documentElement);

    // The normal range, when set, is shaded so that excursions stand out.
    if (sensor.min !== null || sensor.max !== null) {
      const top = y(sensor.max ?? high);
      context.fillStyle = styles.getPropertyValue('--range-fill');
      context.fillRect(0, top, SPARK_WIDTH, y(sensor.min ?? low) - top);
    }
    context.strokeStyle = styles.getPropertyValue('--wine-ink');
    context.lineWidth = 1.5;
    context.beginPath();
    points.forEach(([time, value], index) => {
      if (index === 0) context.moveTo(x(time), y(value));
      else context.lineTo(x(time), y(value));
    });
    context.stroke();
  }
}
