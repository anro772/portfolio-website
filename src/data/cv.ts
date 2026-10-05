export const profile = {
  name: "Andrei Stefan",
  role: ".NET Application Developer",
  email: "andreistefan7272@gmail.com",
  phone: "+40 751 816 393",
  phoneHref: "tel:+40751816393",
  github: "https://github.com/anro772",
  linkedin: "https://www.linkedin.com/in/andrei-stefan-35675b232/",
  location: "Bucharest, Romania",
  summary:
    "Application developer with over two and a half years at IBM on myUCB, a GxP-regulated patient management system for the pharmaceutical client UCB. I grew from junior developer to the only .NET developer on the application, owning production diagnostics, bug fixing, releases and Installation Qualification documentation. Reliable, on-schedule delivery in a regulated environment.",
};

export const numbers = [
  { value: 5, suffix: "", label: "major production releases" },
  { value: 100, suffix: "+", label: "merged changes" },
  { value: 30, suffix: "+", label: "Snyk vulnerability fixes" },
  { value: 30, suffix: "+", label: "production incidents resolved" },
  { value: 0, suffix: "", label: "rollbacks" },
];

export type Role = {
  title: string;
  company: string;
  period: string;
  year: string;
  context?: string;
  points: string[];
};

export const experience: Role[] = [
  {
    title: ".NET Application Developer",
    company: "IBM",
    period: "Jan 2024 to present",
    year: "2024",
    context: "myUCB patient management system for UCB (pharma)",
    points: [
      "Only .NET developer on the application, responsible for production diagnostics, bug fixing, updates and IQ deliverables.",
      "Delivered 5 major production releases plus regular dev and acceptance deployments, with 100+ merged changes, 30+ Snyk vulnerability fixes and zero rollbacks.",
      "Diagnosed and resolved 30+ production incidents through Azure Application Insights, with a pre-deployment dry run for every release.",
      "Authored IQ protocols and GxP change records for every release. None returned with validation findings.",
      "Took over the application after the senior developer left and the team was downsized, keeping 100% of maintenance milestones on schedule.",
    ],
  },
  {
    title: ".NET Developer Intern",
    company: "IBM",
    period: "Aug 2022 to Dec 2022",
    year: "2022",
    points: [
      "IBM onboarding and technical training in Angular, TypeScript, .NET and Agile delivery.",
      "Built a training Angular application on a .NET REST API (CRUD, routing, reactive forms), reviewed by IBM mentors.",
      "Practised customer-needs analysis and requirement breakdown in team case studies, then rejoined IBM full-time.",
    ],
  },
  {
    title: "C++ Development Trainee",
    company: "Pentalog",
    period: "Mar 2022 to May 2022",
    year: "2022",
    points: ["Built a mathematical expression parser in C++ capable of solving complex expressions."],
  },
];

export type Project = {
  name: string;
  kind: string;
  year?: string;
  blurb: string;
  tags: string[];
  href: string;
  /** seed for the procedural glyph visual */
  seed: number;
  pattern: "rings" | "wave" | "grid" | "bars" | "orbit" | "noise" | "scan";
};

export const projects: Project[] = [
  {
    name: "Privacy Browser",
    kind: "Master's dissertation",
    year: "2026",
    blurb:
      "A C# WPF browser on WebView2 and EF Core with content blocking, rule-based CSS/JS injection, isolated profiles, MV3 extensions and a rule-sharing marketplace API. 400+ unit tests.",
    tags: ["C#", "WPF", "WebView2", "EF Core"],
    href: "https://github.com/anro772/browser",
    seed: 11,
    pattern: "rings",
  },
  {
    name: "REVERB",
    kind: "Bachelor's thesis",
    year: "2023",
    blurb:
      "Real-time messaging, group chats, notifications and video calls with screen sharing. ASP.NET Core API with SignalR and JWT, Angular client, MySQL via Entity Framework.",
    tags: ["ASP.NET Core", "SignalR", "Angular"],
    href: "https://github.com/anro772/REVERB",
    seed: 23,
    pattern: "wave",
  },
  {
    name: "Replayd",
    kind: "Desktop tool",
    blurb:
      "Instant-replay recorder in C# / .NET 9 with hardware AV1 encoding via ffmpeg, mixed WASAPI audio and an ETW-based FPS overlay.",
    tags: [".NET 9", "ffmpeg", "WASAPI", "ETW"],
    href: "https://github.com/anro772",
    seed: 37,
    pattern: "bars",
  },
  {
    name: "VOD Segmentor",
    kind: "Python automation",
    blurb:
      "Splits long Twitch streams into individual games with computer vision, enriches them from Riot Match-V5 and writes titles and thumbnails through a local LLM.",
    tags: ["Python", "OpenCV", "Local LLM"],
    href: "https://github.com/anro772",
    seed: 41,
    pattern: "scan",
  },
  {
    name: "Pathdle",
    kind: "Web game",
    blurb:
      "A League of Legends quiz in React and TypeScript, built on Riot's DataDragon API.",
    tags: ["React", "TypeScript"],
    href: "https://github.com/anro772",
    seed: 53,
    pattern: "grid",
  },
  {
    name: "Game modding",
    kind: "Reverse engineering",
    blurb:
      "A UE4SS build for Far Far West (UE 5.7) with hand-extracted AOB signatures, a Lua mod for Abiotic Factor and four C# BepInEx IL2CPP mods for Megabonk.",
    tags: ["UE4SS", "Lua", "BepInEx", "IL2CPP"],
    href: "https://github.com/anro772",
    seed: 67,
    pattern: "noise",
  },
  {
    name: "Luminosity",
    kind: "Desktop tool",
    blurb:
      "Per-monitor colour utility over the AMD Display Library and GDI gamma ramps.",
    tags: ["C#", "ADL", "Win32"],
    href: "https://github.com/anro772",
    seed: 79,
    pattern: "orbit",
  },
];

export const marquee = [
  "C#", ".NET 9", "ASP.NET", "Entity Framework Core", "Angular", "TypeScript", "React", "SignalR",
  "SQL Server", "Azure DevOps", "Application Insights", "WPF", ".NET MAUI", "Python", "Lua", "C++",
];

export const skillGroups = [
  {
    name: "Backend",
    items: [".NET 8 and 9", "ASP.NET", "Entity Framework Core", "MediatR", "WPF", ".NET MAUI", "Node.js"],
  },
  {
    name: "Frontend",
    items: ["Angular", "React", "Vue.js", "Tailwind CSS", "Bootstrap", "Vite", "WebView2"],
  },
  {
    name: "Data and DevOps",
    items: ["SQL Server", "SQLite", "Supabase", "Azure DevOps", "Application Insights", "CI/CD", "Git"],
  },
  {
    name: "Practice and tooling",
    items: ["xUnit", "Moq", "MVVM", "Repository pattern", "Snyk SAST", "IQ / GxP", "Ollama", "Win32 / P/Invoke"],
  },
];

export const languages = ["C#", "TypeScript", "JavaScript", "Python", "SQL", "Lua", "C++", "Java", "C"];
