// ---------------------------------------------------------------------------
// All of the site's text and links live here.
// The panels and the signs in the 3D scene read from this file, so you only
// ever need to edit your content in one place.
// Everything marked TODO is placeholder text for you to replace.
// ---------------------------------------------------------------------------

export const site = {
  name: 'Alexander', // TODO: full name if you like
};

// Text painted on the signs in the 3D scene. Each sign is a list of lines;
// the last line is drawn biggest.
export const signs = {
  welcome: ["Hi, I'm", site.name],
  about: ['About'],
  projects: ['Projects'],
  contact: ['Contact'],
};

export const about = {
  // `title` is the nav button; `heading` is the big title inside the panel.
  title: 'About me',
  heading: site.name,
  // Optional: shown after the title in the small line above the heading
  // (e.g. a place name). Leave it '' to show just the title.
  place: '',
  role: 'Software Engineer',
  // Shown as a green pill next to the role. Set to '' to hide it.
  status: 'Available for work',
  // Big first paragraph, then the rest of the bio (each string is a paragraph).
  lead: 'CS graduate from UNSW (2025) and software engineer. I’ve led a team of tutors and handled technical escalations at Optus, so I’m as comfortable explaining a system as building one.',
  bio: [
    'When I’m not coding, I’m usually tinkering with self-hosted AI or building tools to make everyday things easier.',
  ],
  // Little fact tiles under the intro. Keep an even number so they pair up.
  // `\n` starts a new line inside a tile.
  facts: [
    { label: 'Degree', value: 'B.Sc. Computer Science\nUNSW, 2025' },
    { label: 'Open to', value: 'Remote, hybrid\nor on-site' },
  ],
  // Buttons under the intro. The résumé and email addresses come from `contact`
  // below; the résumé button hides itself until public/resume.pdf exists.
  links: {
    projects: 'See what I’ve built',
    resume: 'Résumé',
    email: 'Email me',
  },
  // The last thing in the panel: a nudge on to the Projects building.
  outro: {
    text: 'Next stop: the Studio, where my projects live.',
    button: 'Go to Projects',
  },
  // Four groups, one per colour route on the climbing wall (AFrameHolds).
  // `color` tints the hold-shaped dot and the chips for that group;
  // set it to match the hold colours in your model if you like.
  skills: [
    { area: 'Languages', color: '#e4572e', items: ['TypeScript', 'JavaScript', 'Python', 'Java', 'SQL'] },
    { area: 'Frontend', color: '#2e86de', items: ['React', 'Next.js', 'Tailwind', 'Three.js'] },
    { area: 'Backend & data', color: '#f2c14e', items: ['Node.js', 'Express', 'PostgreSQL', 'Supabase', 'SQLite'] },
    { area: 'Tools', color: '#6ab04c', items: ['Git', 'Blender', 'Vite', 'Tauri'] },
  ],
  // Newest first. Shown as a timeline. Leave `text` empty ('') for a short
  // one-line entry; save the descriptions for the roles that matter most.
  // (Your degree is in `facts` above, so there's no separate education list.)
  experience: [
    {
      role: 'Sales Associate',
      org: 'Optus (Singtel Group)',
      dates: 'Apr 2024 – Present',
      text: 'I resolve 70–80% of complex billing and technical inquiries on first contact and I’m the store’s go-to escalation point for technical issues. Turning technical specs into plain-English recommendations has me beating monthly KPIs by 15% and store NPS targets by 35%.',
    },
    {
      role: 'Team Leader',
      org: 'Elevate Tuition',
      dates: 'Jan 2022 – Dec 2024',
      text: 'Led and mentored a team of tutors, bringing in performance frameworks that made session attendance 50% more consistent. Redesigned scheduling and workflows to cut coordination overhead, and was the first point of contact for academic and operational issues.',
    },
    { role: 'Team Member', org: 'Woolworths Group', dates: 'Feb 2022 – Aug 2023', text: '' },
    { role: 'Team Member', org: 'Australian Electoral Commission', dates: 'Jan 2022 – Dec 2023', text: '' },
  ],
  // `icon` is any emoji (shown big on the card). Text still starting with
  // TODO is shown while developing but left out of the built site.
  hobbies: [
    { icon: '🧗', name: 'Climbing', text: 'A lot like debugging: study the problem, try a move, fall off, try again. Hence the climbing wall on my cabin.' },
    { icon: '🍕', name: 'Pizza', text: 'Hence the pizza oven out the front. Always happy to argue about toppings.' },
  ],
};

export const projects = {
  // `title` is the nav button; `heading` is the big title inside the panel.
  title: 'Projects',
  heading: 'Things I’ve built',
  // Shown after the title in the small line above the heading. '' for none.
  place: 'The Studio',
  // Big first line above the cards. '' to hide it.
  lead: 'Mostly tools I wanted for myself: tracking job applications, money and teams.',
  // Add, remove or reorder cards freely. The first card is the one on the
  // studio monitors when the panel opens.
  // `featured: true` makes a card bigger with a "Featured" label (use it on
  //   one, maybe two, so it still means something).
  // `status` is a small line under the title, e.g. '2025 · Shipped' or
  //   'In progress'. '' to hide it.
  // `repo` is the GitHub link and `live` a deployed version; leave either as ''
  //   and its button is left out.
  // `tags`: 3–4 is plenty. The first three also go on the studio monitor.
  // `image` is a path inside /public (e.g. put a file at public/images/project-1.png
  //   and write 'images/project-1.png'). It's shown on the card and on the
  //   studio's left monitor. Leave it as '' for no image.
  items: [
    {
      title: 'AJ-Trackr',
      featured: true,
      status: '', // TODO: e.g. '2025 · Shipped'
      description: 'Students juggle dozens of job applications in messy spreadsheets. AJ-Trackr is a desktop app (Tauri v2 + React) that puts them on a kanban board, a sortable table and a calendar, and uses Claude Haiku to turn an existing spreadsheet export into tracked applications.',
      tags: ['Tauri', 'React', 'TypeScript', 'Claude API'],
      repo: 'https://github.com/alexanderj03/job-app-track',
      live: '',
      image: '', // TODO: a screenshot of the kanban board
    },
    {
      title: 'Budget Tracker',
      status: '',
      description: 'A full-stack personal finance app: log transactions, see where the money goes by category, and follow monthly trends on charts. Next.js on a PostgreSQL database, deployed on Vercel.',
      tags: ['Next.js', 'PostgreSQL', 'Tailwind', 'Recharts'],
      repo: 'https://github.com/alexanderj03/tracker-budget',
      live: '', // TODO: the Vercel link, if it's public
      image: '',
    },
    {
      title: 'Management App',
      status: '',
      description: 'A task and team management tool with real-time updates, role-based access so everyone sees only what they should, and a clean dashboard UI.',
      tags: ['Next.js', 'TypeScript', 'Prisma', 'Supabase'],
      repo: 'https://github.com/alexanderj03/management-app',
      live: '',
      image: '',
    },
    {
      title: 'Stronger Brains',
      status: '',
      description: 'A mental wellness web app with guided exercises, streak tracking and progress insights, backed by a REST API on Express and SQLite.',
      tags: ['React', 'Express', 'SQLite', 'Node.js'],
      repo: '', // TODO: the repo link (the old site only linked to the GitHub profile)
      live: '',
      image: '',
    },
    {
      title: 'This island',
      status: 'You’re standing in it',
      description: 'I modelled the island in Blender and render it in the browser with Three.js. The water runs on custom GLSL shaders, and click-to-walk plans each route with A* pathfinding over the model’s own geometry.',
      tags: ['Three.js', 'GLSL', 'Blender', 'Vite'],
      repo: '', // TODO: once it's on GitHub
      live: '',
      image: '',
    },
  ],
  // The last thing in the panel: a nudge on to the café.
  outro: {
    text: 'Like what you see? The café is next door.',
    button: 'Go to Contact',
  },
};

export const contact = {
  // `title` is the nav button; `heading` is the big title inside the panel.
  title: 'Contact',
  heading: 'Let’s talk',
  // Shown after the title in the small line above the heading. '' for none.
  place: 'The Café',
  // Big first line, then "Open to" tags, then a normal-sized paragraph.
  lead: 'I’m looking for my next software engineering role.',
  workModes: ['Remote', 'Hybrid', 'On-site'], // [] to hide the tags
  intro: 'If you’re hiring, have a project you think I’d be a good fit for, or just want to chat about tech, pizza toppings or anything in between, I’d love to hear from you.',
  email: 'alexander.jiw@gmail.com',
  // Small print on the email card.
  emailNote: 'Email is the quickest way to reach me.',
  github: 'https://github.com/alexanderj03',
  linkedin: 'https://www.linkedin.com/in/alexander-jiw-2a568822a',
  // Path to your CV inside /public. The résumé buttons hide themselves if it's missing.
  resume: 'resume/Alex_Resume.pdf',
  // The last thing in the panel. Contact is the final stop, so the button
  // takes you back out to the island.
  outro: {
    text: 'Thanks for walking around my island.',
    button: 'Back to the island',
  },
};
