// ---------------------------------------------------------------------------
// ui.js: the HTML layer on top of the 3D canvas: section panels, the nav
// buttons, the "Back to island" button and the hover label.
// ---------------------------------------------------------------------------
import { about, projects, contact } from './content.js';

const BASE = import.meta.env.BASE_URL;
const NARROW_SCREEN = window.matchMedia('(max-width: 700px)');
// On phones the bottom sheet starts at this fraction of the screen height
// (keep in step with `max-height: 60dvh` in style.css)...
const SHEET_HEIGHT = 0.6;
// ...and grows taller once you've scrolled this many pixels into it.
const SHEET_EXPAND_AFTER = 24;

export const SECTIONS = {
  // `eyebrow` (optional) is the small line shown above the panel heading.
  // `heading` (optional) replaces the title inside the panel; the nav button
  // always shows `title`.
  about: {
    title: about.title,
    heading: about.heading,
    eyebrow: about.place ? `${about.title} · ${about.place}` : about.title,
    render: renderAbout,
  },
  projects: {
    title: projects.title,
    heading: projects.heading,
    eyebrow: projects.place ? `${projects.title} · ${projects.place}` : projects.title,
    render: renderProjects,
  },
  contact: {
    title: contact.title,
    heading: contact.heading,
    eyebrow: contact.place ? `${contact.title} · ${contact.place}` : contact.title,
    render: renderContact,
  },
};

// How long the "Copy" button says "Copied" before switching back.
const COPIED_MS = 2000;

// Small inline icons for the contact links. Kept as SVG text (not image
// files) so they pick up the link colour through `currentColor`.
const ICONS = {
  github:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>',
  linkedin:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z"/></svg>',
  resume:
    '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg>',
  // Nav icons for the phone tab bar: the A-frame cabin and a studio monitor.
  cabin:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 3 20h18z"/><path d="M10 20v-5h4v5"/></svg>',
  monitor:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>',
  cup: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10h12v4a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M16 11h1.5a2.5 2.5 0 0 1 0 5H16"/><path d="M8 3.5c-1 1.2 1 2 0 3.5M12 3.5c-1 1.2 1 2 0 3.5"/></svg>',
};

// Which icon each section's nav button gets (shown on phones only).
const NAV_ICONS = { about: 'cabin', projects: 'monitor', contact: 'cup' };

// `onNavigate(section)` is called when a nav button is pressed,
// `onBack()` when the user asks to go back (button, close, or Esc),
// `onPreviewProject(index)` when a project card is hovered, focused or tapped
// (main.js puts that project on the studio monitors).
export function createUI({ onNavigate, onBack, onPreviewProject = () => {} }) {
  const panelsEl = document.getElementById('panels');
  const navEl = document.getElementById('nav');
  const backBtn = document.getElementById('back-btn');
  const labelEl = document.getElementById('hover-label');

  // --- Build one panel + one nav button per section ---------------------
  const panels = {};
  const navButtons = {};
  for (const [key, section] of Object.entries(SECTIONS)) {
    const headingId = `panel-${key}-title`;
    const closeBtn = el('button', { class: 'panel-close', type: 'button', 'aria-label': 'Close and go back to the island' }, '×');
    closeBtn.addEventListener('click', onBack);

    const body = el('div', { class: 'panel-body' }, ...section.render());
    // Number each block so the CSS can fade them in one after another.
    [...body.children].forEach((child, i) => child.style.setProperty('--i', i));

    // `data-section` lets style.css give each panel its own colours.
    const panel = el(
      'section',
      { class: 'panel', id: `panel-${key}`, 'data-section': key, role: 'dialog', 'aria-labelledby': headingId, hidden: '' },
      closeBtn,
      el(
        'header',
        { class: 'panel-header' },
        section.eyebrow ? el('p', { class: 'panel-eyebrow' }, section.eyebrow) : null,
        el('h2', { id: headingId, tabindex: '-1' }, section.heading ?? section.title),
      ),
      body,
    );
    // Phones: once you start reading, let the sheet grow so more fits on screen.
    panel.addEventListener(
      'scroll',
      () => {
        if (NARROW_SCREEN.matches && panel.scrollTop > SHEET_EXPAND_AFTER) panel.classList.add('expanded');
      },
      { passive: true },
    );
    panelsEl.append(panel);
    panels[key] = panel;

    const navIcon = el('span', { class: 'nav-icon', 'aria-hidden': 'true' });
    navIcon.innerHTML = ICONS[NAV_ICONS[key]] ?? ''; // our own fixed SVG text, never user content
    const btn = el('button', { type: 'button', 'aria-controls': panel.id }, navIcon, el('span', {}, section.title));
    btn.addEventListener('click', () => onNavigate(key));
    navEl.append(btn);
    navButtons[key] = btn;
  }

  // Buttons inside a panel that lead to another section ("See what I've built")
  // or back out to the island.
  panelsEl.addEventListener('click', (e) => {
    const link = e.target.closest('[data-goto]');
    if (link) onNavigate(link.dataset.goto);
    if (e.target.closest('[data-back]')) onBack();
  });
  hideMissingResume(panelsEl);

  // --- Project cards ↔ studio monitors ------------------------------------
  // Whichever card you point at, tab to or tap goes up on the monitors, and
  // that card gets the `on-screen` outline so you can tell which one it is.
  const projectsPanel = panels.projects;
  let onScreenCard = null;
  function previewCard(card) {
    if (!card || card === onScreenCard) return;
    onScreenCard?.classList.remove('on-screen');
    card.classList.add('on-screen');
    onScreenCard = card;
    onPreviewProject(Number(card.dataset.project));
  }
  for (const type of ['pointerover', 'focusin', 'click']) {
    projectsPanel.addEventListener(type, (e) => previewCard(e.target.closest('.project-card')));
  }
  // "More" / "Less" on phones.
  projectsPanel.addEventListener('click', (e) => {
    const btn = e.target.closest('.project-more');
    if (!btn) return;
    const open = btn.getAttribute('aria-expanded') !== 'true';
    btn.setAttribute('aria-expanded', open);
    btn.textContent = open ? 'Less' : 'More';
    btn.closest('.project-card').classList.toggle('desc-open', open);
  });
  watchClamped(projectsPanel);

  backBtn.addEventListener('click', onBack);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') onBack();
  });

  // --- Opening / closing panels -----------------------------------------
  let openKey = null;
  let returnFocusTo = null; // element to re-focus when the panel closes

  function openPanel(key) {
    if (openKey === key) return;
    // Remember what had focus (e.g. a nav button) so keyboard users get back there.
    if (!panelsEl.contains(document.activeElement)) returnFocusTo = document.activeElement;
    for (const [k, panel] of Object.entries(panels)) {
      if (k !== key) hidePanel(panel);
    }
    const panel = panels[key];
    panel.hidden = false;
    // Each visit to the Studio starts with the first project on the monitors.
    if (key === 'projects') previewCard(panel.querySelector('.project-card'));
    // Wait one frame so the browser sees the "closed" state before animating to "open".
    requestAnimationFrame(() => panel.classList.add('open'));
    panel.scrollTop = 0;
    panel.querySelector('h2').focus({ preventScroll: true });

    openKey = key;
    backBtn.hidden = false;
    for (const [k, btn] of Object.entries(navButtons)) {
      btn.setAttribute('aria-current', k === key ? 'true' : 'false');
    }
    document.body.classList.add('has-panel');
  }

  function closePanels({ returnFocus = true } = {}) {
    if (!openKey) return;
    Object.values(panels).forEach(hidePanel);
    openKey = null;
    backBtn.hidden = true;
    Object.values(navButtons).forEach((btn) => btn.setAttribute('aria-current', 'false'));
    document.body.classList.remove('has-panel');
    if (returnFocus && returnFocusTo && document.contains(returnFocusTo)) returnFocusTo.focus({ preventScroll: true });
    returnFocusTo = null;
  }

  function hidePanel(panel) {
    if (panel.hidden) return;
    panel.classList.remove('open');
    // Actually hide it once the slide-out transition has finished.
    const finish = () => {
      if (panel.classList.contains('open')) return;
      panel.hidden = true;
      panel.classList.remove('expanded'); // next time, start at the short height again
    };
    panel.addEventListener('transitionend', finish, { once: true });
    setTimeout(finish, 400); // fallback (e.g. reduced motion = no transition)
  }

  // How much of the screen the open panel covers, as fractions (0..1).
  // The camera uses this to frame the building in the part you can still see.
  function getPanelInset() {
    const panel = openKey && panels[openKey];
    if (!panel) return { right: 0, bottom: 0 };
    if (NARROW_SCREEN.matches) {
      // Use the sheet's starting height even while it's grown, so the camera
      // keeps the building in the top part of the screen.
      return { right: 0, bottom: Math.min(panel.offsetHeight / window.innerHeight, SHEET_HEIGHT) };
    }
    const margin = window.innerWidth - panel.offsetLeft - panel.offsetWidth;
    return { right: Math.min((panel.offsetWidth + margin * 2) / window.innerWidth, 0.6), bottom: 0 };
  }

  // --- Hover label ------------------------------------------------------
  function showLabel(text, x, y) {
    labelEl.textContent = text;
    labelEl.hidden = false;
    labelEl.style.transform = `translate(${x + 14}px, ${y + 14}px)`;
  }
  function hideLabel() {
    labelEl.hidden = true;
  }

  return { openPanel, closePanels, getPanelInset, showLabel, hideLabel };
}

// ---------------------------------------------------------------------------
// Section content. Each function returns a list of DOM elements built from
// content.js. (Built with DOM methods, so any text you write is shown as-is.)
// ---------------------------------------------------------------------------
export function renderAbout() {
  return [
    // Role + "available" pill, then the big intro line and the rest of the bio.
    el(
      'div',
      { class: 'about-role' },
      el('span', {}, about.role),
      about.status ? el('span', { class: 'status-pill' }, el('span', { class: 'status-dot', 'aria-hidden': 'true' }), about.status) : null,
    ),
    el('p', { class: 'lead' }, about.lead),
    ...about.bio.map((p) => el('p', {}, p)),
    el(
      'dl',
      { class: 'facts' },
      ...about.facts.map((f) => el('div', { class: 'fact' }, el('dt', {}, f.label), el('dd', {}, f.value))),
    ),
    // What a recruiter wants next, near the top so it's seen without scrolling.
    el(
      'div',
      { class: 'about-links' },
      el('button', { type: 'button', class: 'btn btn-primary', 'data-goto': 'projects' }, `${about.links.projects} →`),
      el('a', { class: 'btn', href: BASE + contact.resume, download: '', 'data-resume': '' }, about.links.resume),
      el('a', { class: 'btn', href: `mailto:${contact.email}` }, about.links.email),
    ),

    el('h3', {}, 'Tech stack'),
    el(
      'ul',
      { class: 'skills' },
      // `--hold` is the group colour; the CSS uses it for the dot and the chip tint.
      ...about.skills.map((group) =>
        el(
          'li',
          { style: `--hold:${group.color}` },
          el('span', { class: 'skill-area' }, el('span', { class: 'hold', 'aria-hidden': 'true' }), group.area),
          el('ul', { class: 'chips' }, ...group.items.map((item) => el('li', {}, item))),
        ),
      ),
    ),

    el('h3', {}, 'Experience'),
    renderTimeline(about.experience),

    el('h3', {}, 'Off the clock'),
    el(
      'ul',
      { class: 'hobbies' },
      ...about.hobbies.map((h) =>
        el(
          'li',
          {},
          el('span', { class: 'hobby-icon', 'aria-hidden': 'true' }, h.icon),
          el('strong', {}, h.name),
          isPlaceholder(h.text) ? null : el('span', {}, h.text),
        ),
      ),
    ),

    // End on a way forward rather than a dead end.
    el(
      'div',
      { class: 'panel-outro' },
      el('p', {}, about.outro.text),
      el('button', { type: 'button', class: 'btn btn-primary', 'data-goto': 'projects' }, `${about.outro.button} →`),
    ),
  ];
}

// Leftover "TODO: …" text shows while developing (so you spot it) but is left
// out of the built site.
function isPlaceholder(text) {
  return !text || (import.meta.env.PROD && text.startsWith('TODO'));
}

// A vertical timeline: role, "org · dates", then an optional description.
// Entries without a description get the compact `tl-brief` style.
function renderTimeline(entries) {
  return el(
    'ol',
    { class: 'timeline' },
    ...entries.map((e) =>
      el(
        'li',
        e.text ? {} : { class: 'tl-brief' },
        el('strong', { class: 'tl-role' }, e.role),
        el('span', { class: 'tl-meta' }, `${e.org} · `, el('span', { class: 'tl-dates' }, e.dates)),
        e.text ? el('p', {}, e.text) : null,
      ),
    ),
  );
}

export function renderProjects() {
  const newTab = { target: '_blank', rel: 'noopener' };

  // "Code" button with the GitHub mark in front.
  const codeLink = (href, title) => {
    const icon = el('span', { class: 'btn-icon' });
    icon.innerHTML = ICONS.github; // our own fixed SVG text, never user content
    return el('a', { class: 'btn', href, 'aria-label': `${title} code on GitHub`, ...newTab }, icon, 'Code');
  };

  return [
    projects.lead ? el('p', { class: 'lead' }, projects.lead) : null,
    el(
      'ul',
      { class: 'project-list' },
      ...projects.items.map((p, i) =>
        el(
          'li',
          {
            class: p.featured ? 'project-card featured' : 'project-card',
            style: `--j:${i}`, // staggers the entrance (style.css)
            'data-project': i, // which project to put on the studio monitors
          },
          p.featured ? el('span', { class: 'project-badge' }, 'Featured') : null,
          p.image ? el('img', { src: BASE + p.image, alt: '', loading: 'lazy' }) : null,
          // "01", "02"... like file numbers on the studio screens.
          el(
            'div',
            { class: 'project-head' },
            el('span', { class: 'project-num', 'aria-hidden': 'true' }, String(i + 1).padStart(2, '0')),
            el('h3', {}, p.title),
          ),
          p.status ? el('p', { class: 'project-status' }, p.status) : null,
          el('p', { class: 'project-desc', id: `project-desc-${i}` }, p.description),
          // Phones cut long descriptions short; this button shows the rest.
          // It stays hidden unless the text is actually cut (see watchClamped).
          el('button', { type: 'button', class: 'project-more', 'aria-expanded': 'false', 'aria-controls': `project-desc-${i}`, hidden: '' }, 'More'),
          el('ul', { class: 'tags', 'aria-label': 'Technologies' }, ...p.tags.map((t) => el('li', {}, t))),
          // Only the buttons that have a link; no row at all if neither does.
          p.repo || p.live
            ? el(
                'div',
                { class: 'project-links' },
                p.live ? el('a', { class: 'btn btn-primary', href: p.live, 'aria-label': `${p.title} live site`, ...newTab }, 'Live site ↗') : null,
                p.repo ? codeLink(p.repo, p.title) : null,
              )
            : null,
        ),
      ),
    ),

    // End on a way forward: the café is the last stop.
    el(
      'div',
      { class: 'panel-outro' },
      el('p', {}, projects.outro.text),
      el('button', { type: 'button', class: 'btn btn-primary', 'data-goto': 'contact' }, `${projects.outro.button} →`),
    ),
  ];
}

export function renderContact() {
  // One big tappable row per link: icon, name, address, arrow.
  // `attrs` are extra attributes for the <a> (new tab, download, ...).
  const linkRow = (icon, label, detail, href, attrs = {}, arrow = '↗') => {
    const iconEl = el('span', { class: 'contact-icon' });
    iconEl.innerHTML = ICONS[icon]; // our own fixed SVG text above, never user content
    return el(
      'li',
      icon === 'resume' ? { 'data-resume': '' } : {},
      el(
        'a',
        { class: 'contact-link', href, ...attrs },
        iconEl,
        el('span', { class: 'contact-text' }, el('strong', {}, label), el('span', {}, detail)),
        el('span', { class: 'contact-arrow', 'aria-hidden': 'true' }, arrow),
      ),
    );
  };
  const newTab = { target: '_blank', rel: 'noopener' };

  return [
    el('p', { class: 'lead' }, contact.lead),
    contact.workModes.length
      ? el(
          'div',
          { class: 'work-modes' },
          el('span', { class: 'work-modes-label' }, 'Open to'),
          el('ul', { class: 'chips' }, ...contact.workModes.map((mode) => el('li', {}, mode))),
        )
      : null,
    contact.intro ? el('p', {}, contact.intro) : null,

    // The email "postcard", a nod to the red post box beside the café.
    el(
      'div',
      { class: 'postcard' },
      postcardStamp(),
      el('span', { class: 'postcard-label' }, 'Email'),
      el('a', { class: 'postcard-email', href: `mailto:${contact.email}` }, contact.email),
      el(
        'div',
        { class: 'postcard-actions' },
        el('a', { class: 'btn btn-primary', href: `mailto:${contact.email}` }, 'Send an email'),
        ...renderCopyButton(contact.email),
      ),
      contact.emailNote ? el('p', { class: 'postcard-note' }, contact.emailNote) : null,
    ),

    el('h3', {}, 'Find me online'),
    el(
      'ul',
      { class: 'contact-links' },
      linkRow('github', 'GitHub', prettyUrl(contact.github), contact.github, newTab),
      linkRow('linkedin', 'LinkedIn', prettyUrl(contact.linkedin), contact.linkedin, newTab),
      linkRow('resume', 'Résumé', 'Download PDF', BASE + contact.resume, { download: '' }, '↓'),
    ),

    // Contact is the last stop, so end with the way back out.
    el(
      'div',
      { class: 'panel-outro' },
      el('p', {}, contact.outro.text),
      el('button', { type: 'button', class: 'btn btn-primary', 'data-back': '' }, `← ${contact.outro.button}`),
    ),
  ];
}

// The little stamp stuck on the postcard's corner: a coffee cup from the café.
// Purely decoration, so screen readers skip it.
function postcardStamp() {
  const stamp = el('span', { class: 'postcard-stamp', 'aria-hidden': 'true' });
  stamp.innerHTML = `<span>${ICONS.cup}</span>`; // our own fixed SVG text
  return stamp;
}

// "Copy" button for the email address: handy when the visitor's computer has
// no email app set up, so a mailto: link does nothing. The clipboard API only
// works on https or localhost, so the button leaves itself out elsewhere.
// Returns [button, live region], or [] when there's no clipboard.
function renderCopyButton(text) {
  if (!navigator.clipboard) return [];
  const label = el('span', {}, 'Copy address');
  const btn = el('button', { type: 'button', class: 'btn' }, label);
  // Screen readers hear "Copied" through this live region. It sits next to
  // the button, not inside it, so it doesn't become part of the button's name.
  const status = el('span', { class: 'visually-hidden', 'aria-live': 'polite' });
  let timer = 0;
  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return; // blocked by the browser: leave the button as it was
    }
    label.textContent = 'Copied ✓';
    status.textContent = 'Email address copied';
    btn.classList.add('copied');
    clearTimeout(timer);
    timer = setTimeout(() => {
      label.textContent = 'Copy address';
      status.textContent = '';
      btn.classList.remove('copied');
    }, COPIED_MS);
  });
  return [btn, status];
}

// If public/resume.pdf hasn't been added yet, hide the résumé links rather
// than offer a broken download. Like loader.js, a text/html reply counts as
// "missing", because Vite answers unknown paths with index.html.
async function hideMissingResume(container) {
  try {
    const res = await fetch(BASE + contact.resume, { method: 'HEAD' });
    const type = res.headers.get('content-type') || '';
    if (res.ok && !type.includes('text/html')) return;
  } catch {
    // Offline or blocked: treat it as missing.
  }
  container.querySelectorAll('[data-resume]').forEach((node) => (node.hidden = true));
}

// On phones style.css cuts project descriptions to a few lines. Show each
// card's "More" button only when its text really is cut short. A
// ResizeObserver re-checks whenever a description changes size: when the
// panel first opens, on rotate/resize, and when the text is expanded.
function watchClamped(container) {
  const observer = new ResizeObserver((entries) => {
    for (const { target } of entries) {
      const card = target.closest('.project-card');
      if (card.classList.contains('desc-open')) continue; // expanded: keep "Less" showing
      card.querySelector('.project-more').hidden = target.scrollHeight <= target.clientHeight + 1;
    }
  });
  container.querySelectorAll('.project-desc').forEach((p) => observer.observe(p));
}

// "https://github.com/me" -> "github.com/me"
function prettyUrl(url) {
  return url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
}

// Tiny helper: el('a', { href: '#' }, 'text', otherElement) -> <a href="#">text…</a>
// null/false children are skipped.
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  for (const child of children) {
    if (child != null && child !== false) node.append(child);
  }
  return node;
}
