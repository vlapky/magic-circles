import { h } from './dom';

/** Привязка контролов к объекту: путь вида 'layers.polygram.n'. */
export interface Bind {
  obj: object;
  /** rebuild = изменение меняет состав панели */
  onChange: (path: string, rebuild: boolean) => void;
}

export function getPath(obj: object, path: string): unknown {
  let cur: unknown = obj;
  for (const k of path.split('.')) cur = (cur as Record<string, unknown>)[k];
  return cur;
}

export function setPath(obj: object, path: string, value: unknown): void {
  const keys = path.split('.');
  let cur = obj as Record<string, unknown>;
  for (let i = 0; i < keys.length - 1; i++) cur = cur[keys[i]] as Record<string, unknown>;
  cur[keys[keys.length - 1]] = value;
}

let seq = 0;
const nextId = (): string => `f${++seq}`;

export function check(b: Bind, path: string, label: string, rebuild = false): HTMLElement {
  const id = nextId();
  const input = h('input', {
    type: 'checkbox',
    id,
    checked: !!getPath(b.obj, path),
    onchange: () => {
      setPath(b.obj, path, input.checked);
      b.onChange(path, rebuild);
    },
  });
  return h('label', { class: 'field check', for: id }, input, h('span', null, label));
}

export function range(b: Bind, path: string, label: string, min: number, max: number, step: number, unit = ''): HTMLElement {
  const id = nextId();
  const fmt = (v: number): string => `${Math.round(v * 100) / 100}${unit}`;
  const cur = Number(getPath(b.obj, path));
  const out = h('output', { for: id }, fmt(cur));
  const input = h('input', {
    type: 'range',
    id,
    min: String(min),
    max: String(max),
    step: String(step),
    oninput: () => {
      const v = Number(input.value);
      setPath(b.obj, path, v);
      out.textContent = fmt(v);
      b.onChange(path, false);
    },
  });
  input.value = String(cur);
  return h('div', { class: 'field range' }, h('label', { for: id }, label), input, out);
}

export function select(
  b: Bind,
  path: string,
  label: string,
  options: readonly (readonly [string | number, string])[],
  rebuild = false,
): HTMLElement {
  const id = nextId();
  const cur = getPath(b.obj, path);
  const sel = h(
    'select',
    {
      id,
      onchange: () => {
        setPath(b.obj, path, typeof cur === 'number' ? Number(sel.value) : sel.value);
        b.onChange(path, rebuild);
      },
    },
    ...options.map(([v, text]) => h('option', { value: String(v), selected: String(v) === String(cur) }, text)),
  );
  return h('div', { class: 'field select' }, h('label', { for: id }, label), sel);
}

export function color(b: Bind, path: string, label: string): HTMLElement {
  const id = nextId();
  const input = h('input', {
    type: 'color',
    id,
    value: String(getPath(b.obj, path)),
    oninput: () => {
      setPath(b.obj, path, input.value);
      b.onChange(path, false);
    },
  });
  return h('div', { class: 'field color' }, h('label', { for: id }, label), input);
}

export function text(b: Bind, path: string, label: string, placeholder = '', onCommit?: () => void): HTMLElement {
  const id = nextId();
  const input = h('input', {
    type: 'text',
    id,
    value: String(getPath(b.obj, path) ?? ''),
    placeholder,
    spellcheck: false,
    autocomplete: 'off',
    oninput: () => {
      setPath(b.obj, path, input.value);
      b.onChange(path, false);
    },
    onchange: () => onCommit?.(),
  });
  return h('div', { class: 'field text' }, h('label', { for: id }, label), input);
}

export function button(label: string, onClick: () => void, cls = ''): HTMLButtonElement {
  return h('button', { type: 'button', class: `btn ${cls}`.trim(), onclick: onClick }, label);
}

/** Сворачиваемая секция панели; состояние хранится в наборе open. */
export function section(id: string, title: string, open: Set<string>, onToggle: () => void, ...body: (HTMLElement | null | false)[]): HTMLElement {
  const d = h('details', { class: 'section', open: open.has(id) }, h('summary', null, title), h('div', { class: 'section-body' }, ...body));
  d.addEventListener('toggle', () => {
    if (d.open) open.add(id);
    else open.delete(id);
    onToggle();
  });
  return d;
}
