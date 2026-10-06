import './ui/styles.css';
import { mountCircleTab } from './ui/circleTab';
import { mountAnimTab } from './ui/animTab';
import { h } from './ui/dom';
import { mountEvolveTab } from './ui/evolveTab';
import { mountLibraryTab } from './ui/libraryTab';
import { app, persist, type Tab } from './ui/state';
import { mountSystemTab } from './ui/systemTab';

const TABS: [Tab, string][] = [
  ['circle', 'Круг'],
  ['evolve', 'Эволюция'],
  ['anim', 'Анимация'],
  ['system', 'Система'],
  ['library', 'Библиотека'],
];

const root = document.getElementById('app')!;
const work = h('main', { class: 'work', id: 'work' });
const tabs = h('nav', { class: 'tabs', 'aria-label': 'Разделы' });

/** Уборка за текущей вкладкой: анимация останавливает кадры и музыку. */
let leave: (() => void) | void;

function go(tab: Tab): void {
  leave?.();
  leave = undefined;
  app.tab = tab;
  persist();
  tabs.replaceChildren(
    ...TABS.map(([id, label]) =>
      h('button', { type: 'button', class: 'tab', 'aria-current': id === tab ? 'page' : undefined, onclick: () => go(id) }, label),
    ),
  );
  work.className = `work ${tab}`;
  if (tab === 'circle') mountCircleTab(work);
  else if (tab === 'evolve') mountEvolveTab(work, go);
  else if (tab === 'anim') leave = mountAnimTab(work, go);
  else if (tab === 'system') mountSystemTab(work, () => go('circle'));
  else mountLibraryTab(work, go);
}

root.append(h('header', { class: 'top' }, h('h1', null, 'Магические круги'), tabs), work);
go(app.tab);
