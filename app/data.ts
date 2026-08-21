export type SkillStatus = "not-started" | "learning" | "ready" | "complete";

export type Skill = {
  id: string;
  title: string;
  group: string;
  area: string;
  href?: string;
  internal?: boolean;
  tier?: "Silver" | "Gold";
  initialStatus?: SkillStatus;
  initialEndorsements?: number;
};

export type LearningArea = {
  id: string;
  name: string;
  shortName: string;
  eyebrow: string;
  description: string;
  skills: Skill[];
};

const skill = (
  area: string,
  group: string,
  id: string,
  title: string,
  extra: Omit<Skill, "area" | "group" | "id" | "title"> = {},
): Skill => ({ area, group, id, title, ...extra });

const ONBOARDING = "onboarding";
const CONTENT = "content-creation";
const SOCIAL = "social-marketing";
const LEADERSHIP = "leadership";

export const learningAreas: LearningArea[] = [
  {
    id: ONBOARDING,
    name: "DC Onboarding",
    shortName: "Onboarding",
    eyebrow: "Start here",
    description: "Core tools, client-ready habits, and the final-project quality checklist.",
    skills: [
      skill(ONBOARDING, "Training & Skill Building", "on-payroll", "Work Study & Payroll Paperwork", { internal: true, initialStatus: "complete", initialEndorsements: 1 }),
      skill(ONBOARDING, "Training & Skill Building", "on-files", "File Organization Guide", { internal: true, initialStatus: "complete", initialEndorsements: 2 }),
      skill(ONBOARDING, "Training & Skill Building", "on-planner", "Use MS Teams Planner", { href: "https://youtu.be/r3dpzqttDuA", initialStatus: "complete", initialEndorsements: 1 }),
      skill(ONBOARDING, "Training & Skill Building", "on-badge", "Use a Badge Card", { href: "https://www.iorad.com/player/2482475/How-to-use-a-TAD-Badge-Card", initialStatus: "complete", initialEndorsements: 2 }),
      skill(ONBOARDING, "Training & Skill Building", "on-hours", "Entering Hours", { internal: true, initialStatus: "learning" }),
      skill(ONBOARDING, "Training & Skill Building", "on-paymo", "Track Hours with Paymo", { href: "https://youtu.be/Ft_pWKbmOwo?si=izRyzc-S_ZPfUWuR", initialStatus: "ready" }),

      skill(ONBOARDING, "Client Relations", "on-primary", "How to Make Primary Contact", { internal: true, initialStatus: "complete", initialEndorsements: 2 }),
      skill(ONBOARDING, "Client Relations", "on-meeting", "In-Person Meeting Guide", { internal: true, initialStatus: "learning" }),
      skill(ONBOARDING, "Client Relations", "on-brand", "Use Digital Corps Brand Guide", { internal: true, initialStatus: "complete", initialEndorsements: 3 }),
      skill(ONBOARDING, "Client Relations", "on-briefs", "Creative Briefs", { href: "https://www.iorad.com/player/2447654/Editing-a-Digital-Corps-Creative-Brief", initialStatus: "learning" }),
      skill(ONBOARDING, "Client Relations", "on-bsu-brand", "BSU Branding Guide", { internal: true }),
      skill(ONBOARDING, "Client Relations", "on-tad-brand", "TAD Branding Guide", { internal: true }),
      skill(ONBOARDING, "Client Relations", "on-presentation", "Make a Digital Presentation with InDesign", { href: "https://www.iorad.com/player/2607783/Make-a-Digital-Presentation-with-InDesign" }),
      skill(ONBOARDING, "Client Relations", "on-costing", "Fill out TAD Costing Estimator", { href: "https://www.iorad.com/player/2477485/Fill-out-the-TAD-Costing-FORM" }),
      skill(ONBOARDING, "Client Relations", "on-make-brief", "Make a Creative Brief", { href: "https://www.iorad.com/player/2447654/Editing-a-Digital-Corps-Creative-Brief" }),
      skill(ONBOARDING, "Client Relations", "on-job-sheet", "Use Job Request Spreadsheet", { href: "https://www.iorad.com/player/2141221/Use-the-OFFICIAL-Digital-Corps-Job-Request-Spreadsheet" }),

      skill(ONBOARDING, "Finished Project Checklist", "on-flow", "Project Flow Chart", { internal: true, initialStatus: "complete", initialEndorsements: 1 }),
      skill(ONBOARDING, "Finished Project Checklist", "on-checklist", "Client Meeting Checklist", { internal: true, initialStatus: "ready" }),
      skill(ONBOARDING, "Finished Project Checklist", "on-grammar", "Grammar Check", { initialStatus: "learning" }),
      skill(ONBOARDING, "Finished Project Checklist", "on-ai-spell", "Spellcheck: Illustrator", { href: "https://youtu.be/ns6orFTwDwE?si=wr3wEI44Os7W0A74" }),
      skill(ONBOARDING, "Finished Project Checklist", "on-id-spell", "Spellcheck: InDesign", { href: "https://youtu.be/nkisUha89jc?si=63o42IlQaJzzeeMC" }),
      skill(ONBOARDING, "Finished Project Checklist", "on-ps-spell", "Spellcheck: Photoshop", { href: "https://youtu.be/VVWLxWSxI7Q?si=IFFopEjd49vJPTUT" }),
      skill(ONBOARDING, "Finished Project Checklist", "on-headline", "Headline Capitalization Check", { href: "https://capitalizemytitle.com/" }),
    ],
  },
  {
    id: CONTENT,
    name: "Content Creation",
    shortName: "Content",
    eyebrow: "Make & produce",
    description: "Graphic design, photography, video, studio, motion, exhibit, and fabrication skills.",
    skills: [
      skill(CONTENT, "Graphic Design", "cc-export-pdf", "Export InDesign to PDF", { href: "https://www.iorad.com/player/2262007/Export-InDesign-Documents-as-PDF-Spreads--TAD-ZINES-", tier: "Silver", initialStatus: "complete", initialEndorsements: 3 }),
      skill(CONTENT, "Graphic Design", "cc-package-id", "Package InDesign Files", { href: "https://drive.google.com/file/d/155_0gUUkwK3w_Cvfokw0d8npdp8hrvzF/view?usp=sharing", tier: "Gold", initialStatus: "ready", initialEndorsements: 1 }),
      skill(CONTENT, "Graphic Design", "cc-poster-design", "Poster Design", { href: "https://www.iorad.com/player/2467747/Make-an-Anatomy-of-Type-Poster", tier: "Silver", initialStatus: "learning" }),
      skill(CONTENT, "Graphic Design", "cc-mockups", "Mockup Templates", { href: "https://www.iorad.com/player/2428157/Use-a-Mockup-Template", tier: "Silver", initialStatus: "complete", initialEndorsements: 2 }),
      skill(CONTENT, "Graphic Design", "cc-make-poster", "Make a Poster", { href: "https://www.iorad.com/player/2467747/Make-an-Anatomy-of-Type-Poster", tier: "Gold", initialStatus: "learning" }),
      skill(CONTENT, "Graphic Design", "cc-stickers", "Stickers", { href: "https://sites.google.com/view/tad-tutorials/hp-330-335-printers?authuser=1", tier: "Silver" }),
      skill(CONTENT, "Graphic Design", "cc-mistakes", "20 Common Mistakes Quiz", { href: "https://forms.cloud.microsoft/r/6LtVKuxu0n", tier: "Silver", initialStatus: "ready" }),
      skill(CONTENT, "Graphic Design", "cc-scan", "Scan Artwork", { href: "https://www.iorad.com/player/2546410/Scan-Artwork-in-TAD", tier: "Silver" }),

      skill(CONTENT, "Photography", "cc-headshots", "Headshots", { href: "https://www.iorad.com/player/2455074/Light-an-Object-and-or-Product-with-the-Lighting-Studio-Light-Box-", initialStatus: "learning" }),
      skill(CONTENT, "Photography", "cc-lighting", "Lighting Studio", { href: "https://www.iorad.com/player/2455074/Light-an-Object-and-or-Product-with-the-Lighting-Studio-Light-Box-", initialStatus: "ready" }),
      skill(CONTENT, "Photography", "cc-camera", "Use the Digital Corps Camera", { initialStatus: "learning" }),
      skill(CONTENT, "Photography", "cc-lapel", "Wireless Lapel Microphone", { href: "https://www.iorad.com/player/2620488/Use-the-Wireless-Lapel-Mic-with-the-Digital-Corps-Camera" }),
      skill(CONTENT, "Photography", "cc-camera-overview", "Camera Interview Overview", { href: "https://www.iorad.com/player/2365987/Use-the-Digital-Corps-Camera-to-Conduct-an-Interview" }),
      skill(CONTENT, "Photography", "cc-gimbal", "Ronin Gimbal", {}),
      skill(CONTENT, "Photography", "cc-gimbal-balance", "Attach & Balance Camera", { href: "https://youtu.be/iPKBbyKkQFw?si=ftcYwypY6v8i2NiX" }),
      skill(CONTENT, "Photography", "cc-gimbal-pair", "Pair Camera to Gimbal", { href: "https://youtu.be/wrmBX8E4Mv8?si=T9bYWq-SX-A0jjh5" }),
      skill(CONTENT, "Photography", "cc-gimbal-overview", "Gimbal Overview", { href: "https://youtu.be/zcf3VokG7_Q?si=EhemzOMlNSM_ONJX" }),
      skill(CONTENT, "Photography", "cc-upscale", "Upscale Images (Super Resolution)", { href: "https://youtu.be/izJHaC6sKPY" }),

      skill(CONTENT, "Audio / Video", "cc-broll", "B-Roll: Shot List & Tips", { initialStatus: "complete", initialEndorsements: 2 }),
      skill(CONTENT, "Audio / Video", "cc-ken-burns", "Ken Burns Effect", { href: "https://youtu.be/Wfid8jnFdyg" }),
      skill(CONTENT, "Audio / Video", "cc-pip", "Picture in Picture", { href: "https://youtu.be/eNKzKz0tTCU" }),
      skill(CONTENT, "Audio / Video", "cc-audio", "Improve Audio", { href: "https://www.iorad.com/player/2365898/Improve-Audio-on-any-Video-with-Audacity-Plugin--Compress-Dynamics", initialStatus: "learning" }),
      skill(CONTENT, "Audio / Video", "cc-package-pr", "Package Premiere Pro", { href: "https://youtu.be/TnbMdqEtsSc?si=kAC5lo5s3iMvKCkS" }),
      skill(CONTENT, "Audio / Video", "cc-sync", "Sync Audio in Premiere Pro", {}),
      skill(CONTENT, "Audio / Video", "cc-vox-resources", "Vox Pop Interview Resources", { internal: true }),
      skill(CONTENT, "Audio / Video", "cc-vox-tutorial", "Vox Pop Tutorial (with DC mics)", {}),

      skill(CONTENT, "Studio Production", "cc-studio-camera", "IM Studio: Camera Setup", { internal: true }),
      skill(CONTENT, "Studio Production", "cc-studio-audio", "IM Studio: Audio Booth", { internal: true }),
      skill(CONTENT, "Studio Production", "cc-studio-interview", "IM Studio: Conduct Interview", { internal: true }),

      skill(CONTENT, "Motion Graphics", "cc-logo-reveal", "Logo Reveal", { initialStatus: "learning" }),
      skill(CONTENT, "Motion Graphics", "cc-motion-package-pr", "Package Premiere Pro", {}),
      skill(CONTENT, "Motion Graphics", "cc-package-ae", "Package After Effects", { href: "https://youtu.be/bUoyPm3DWpM?si=EW6tssaL5-fooL88" }),
      skill(CONTENT, "Motion Graphics", "cc-text-reveal", "Text Reveal Effect", { href: "https://youtu.be/78uhkYo5UOE?si=irtMIjNFmvRAHAeu" }),
      skill(CONTENT, "Motion Graphics", "cc-animate-logo", "Animate Parts of a Logo", { href: "https://youtu.be/UFTnR19zB7k?si=Q6g4Mj1QRFF1htFo", initialStatus: "ready" }),
      skill(CONTENT, "Motion Graphics", "cc-ae-export", "Export a Video from After Effects", { href: "https://youtu.be/ClGaK8fIJVk?si=-kPbh2YwkuVQfjGw" }),
      skill(CONTENT, "Motion Graphics", "cc-express", "Adobe Express", {}),
      skill(CONTENT, "Motion Graphics", "cc-simple-motion", "Simple Motion Graphics", { href: "https://youtu.be/Pa0rseRupGM?si=L3dOAlr-ytWFGQ6E" }),
      skill(CONTENT, "Motion Graphics", "cc-characters", "Animate Characters", { href: "https://youtu.be/PxWG2CBN5oQ" }),
      skill(CONTENT, "Motion Graphics", "cc-character-animator", "Create with Character Animator", { href: "https://pages.adobe.com/character/en/tutorials" }),
      skill(CONTENT, "Motion Graphics", "cc-video-mockup", "Make a Video Mockup", { href: "https://www.iorad.com/player/2645750/Make-a-Video-Mockup" }),

      skill(CONTENT, "Exhibit Design", "cc-bematrix-format", "BeMatrix Panel: Formatting", { internal: true }),
      skill(CONTENT, "Exhibit Design", "cc-bematrix-print", "BeMatrix Panel: Printing", { internal: true }),
      skill(CONTENT, "Exhibit Design", "cc-hp-printers", "Stickers / HP 330-335 Printers", { internal: true }),
      skill(CONTENT, "Fabrication", "cc-dye-sub", "Print for Dye Sublimation", { internal: true }),
      skill(CONTENT, "Fabrication", "cc-heat-press", "Heat Press a Shirt", { href: "https://www.iorad.com/player/1937653/Heat-pressing-a-T-shirt--or-other-flat-substrate-" }),
    ],
  },
  {
    id: SOCIAL,
    name: "Social Media & Marketing",
    shortName: "Social",
    eyebrow: "Plan & connect",
    description: "Campaign planning, publishing, analytics, and confident client communication.",
    skills: [
      skill(SOCIAL, "Marketing", "sm-brief", "Creative Brief", { href: "https://youtu.be/jerBF6CKaY8?si=LYnHhftTJLG-tKw0", initialStatus: "complete", initialEndorsements: 2 }),
      skill(SOCIAL, "Marketing", "sm-qr", "Custom QR Codes", { href: "https://www.iorad.com/player/1953084/Make-a-Custom-QR-Code", initialStatus: "learning" }),
      skill(SOCIAL, "Marketing", "sm-id-qr", "InDesign QR Code", { href: "https://youtu.be/jerBF6CKaY8?si=LYnHhftTJLG-tKw0" }),
      skill(SOCIAL, "Marketing", "sm-linktree", "Linktree Tutorial", { href: "https://www.iorad.com/player/2450888/LinkTree-Information?isPopup=true" }),

      skill(SOCIAL, "Social Media Content", "sm-login", "Log in to School Instagram", { internal: true, initialStatus: "complete", initialEndorsements: 1 }),
      skill(SOCIAL, "Social Media Content", "sm-linktree-guide", "Linktree Information Guide", { internal: true }),
      skill(SOCIAL, "Social Media Content", "sm-plan", "Social Media Plan", { href: "https://www.youtube.com/watch?v=VS0Sao1oHlw", initialStatus: "learning" }),
      skill(SOCIAL, "Social Media Content", "sm-calendar", "Content Calendar", { href: "https://www.youtube.com/watch?v=43pg1XX9YnU", initialStatus: "ready" }),
      skill(SOCIAL, "Social Media Content", "sm-schedule", "Scheduling Posts in Meta Business Suite", { href: "https://www.youtube.com/watch?v=_60YKMMeKv0" }),
      skill(SOCIAL, "Social Media Content", "sm-insights", "Insights Analysis in Meta Business Suite", { href: "https://www.youtube.com/watch?v=sDCCCrhtguI" }),
      skill(SOCIAL, "Social Media Content", "sm-pillars", "Content Pillars", { href: "https://www.youtube.com/watch?v=5wDGFEDx414" }),

      skill(SOCIAL, "Client Relations", "sm-primary", "How to Make Primary Contact", { internal: true, initialStatus: "complete", initialEndorsements: 3 }),
      skill(SOCIAL, "Client Relations", "sm-meeting", "In-Person Meeting Guide", { internal: true, initialStatus: "learning" }),
      skill(SOCIAL, "Client Relations", "sm-dc-brand", "Use Digital Corps Brand Guide", { internal: true, initialStatus: "complete", initialEndorsements: 2 }),
      skill(SOCIAL, "Client Relations", "sm-briefs", "Creative Briefs", { href: "https://www.iorad.com/player/2447654/Editing-a-Digital-Corps-Creative-Brief" }),
      skill(SOCIAL, "Client Relations", "sm-bsu", "BSU Branding Guide", { internal: true }),
      skill(SOCIAL, "Client Relations", "sm-tad", "TAD Branding Guide", { internal: true }),
      skill(SOCIAL, "Client Relations", "sm-presentation", "Make a Digital Presentation with InDesign", { href: "https://www.iorad.com/player/2607783/Make-a-Digital-Presentation-with-InDesign" }),
      skill(SOCIAL, "Client Relations", "sm-costing", "Fill out TAD Costing Estimator", { href: "https://www.iorad.com/player/2477485/Fill-out-the-TAD-Costing-FORM" }),
      skill(SOCIAL, "Client Relations", "sm-make-brief", "Make a Creative Brief", { href: "https://www.iorad.com/player/2447654/Editing-a-Digital-Corps-Creative-Brief" }),
      skill(SOCIAL, "Client Relations", "sm-job-sheet", "Use Job Request Spreadsheet", { href: "https://www.iorad.com/player/2141221/Use-the-OFFICIAL-Digital-Corps-Job-Request-Spreadsheet" }),
    ],
  },
  {
    id: LEADERSHIP,
    name: "Leadership",
    shortName: "Leadership",
    eyebrow: "Guide the team",
    description: "Project ownership, meetings, mentoring, and teaching others through clear tutorials.",
    skills: [
      skill(LEADERSHIP, "Training & Skill Building", "lead-badge", "Use a Badge Card", { href: "https://www.iorad.com/player/2482475/How-to-use-a-TAD-Badge-Card", initialStatus: "complete", initialEndorsements: 2 }),
      skill(LEADERSHIP, "Training & Skill Building", "lead-planner", "Use MS Teams Planner", { href: "https://youtu.be/r3dpzqttDuA", initialStatus: "complete", initialEndorsements: 1 }),
      skill(LEADERSHIP, "Training & Skill Building", "lead-flow", "Project Flow Chart", { internal: true, initialStatus: "ready" }),
      skill(LEADERSHIP, "Training & Skill Building", "lead-checklist", "Client Meeting Checklist", { internal: true, initialStatus: "learning" }),
      skill(LEADERSHIP, "Training & Skill Building", "lead-primary", "How to Make Primary Contact", { internal: true, initialStatus: "complete", initialEndorsements: 3 }),
      skill(LEADERSHIP, "Training & Skill Building", "lead-meeting", "In-Person Meeting Guide", { internal: true, initialStatus: "learning" }),
      skill(LEADERSHIP, "Training & Skill Building", "lead-iorad", "Make an iorad Tutorial", {}),
    ],
  },
];

export const allSkills = learningAreas.flatMap((area) => area.skills);

export type ProjectBrief = {
  id: string;
  title: string;
  discipline: string;
  kicker: string;
  summary: string;
  timeline: string;
  format: string;
  briefHref: string;
  assetHref?: string;
  accent: "green" | "mint" | "orange" | "silver";
  deliverables: string[];
  workflow: string[];
  constraints: string[];
  evaluation?: string[];
  assets?: string[];
};

export const projectBriefs: ProjectBrief[] = [
  {
    id: "welcome-carousel",
    title: "Welcome to Digital Corps",
    discipline: "Onboarding · Adobe Express",
    kicker: "Three-slide social carousel",
    summary: "Introduce Digital Corps, explain what the student-run agency does, and invite people to connect through an approachable, polished carousel.",
    timeline: "5 days",
    format: "3 × 1080 × 1080 px",
    briefHref: "./briefs/welcome-to-digital-corps.docx",
    accent: "green",
    deliverables: ["Three-page Instagram/Facebook carousel", "PNG exports", "Organized Adobe Express project", "Clearly named assets"],
    workflow: ["Page 1: welcome and strong brand introduction", "Page 2: concise overview of services and disciplines", "Page 3: contact details and a welcoming call to action"],
    constraints: ["Use official Digital Corps brand elements", "Maintain mobile readability and accessibility", "Balance fun with professionalism", "Avoid overcrowding slides"],
    evaluation: ["Brand consistency", "Visual hierarchy", "Creativity", "Accessibility", "Social effectiveness", "Overall polish"],
  },
  {
    id: "orchestra-campaign",
    title: "Orchestra Promotion Kit",
    discipline: "Graphic Design",
    kicker: "One concept, two formats",
    summary: "Create cohesive print and social advertising for a classical BSU Music concert while working within university brand and accessibility requirements.",
    timeline: "1 week",
    format: "8.5 × 11 in + 1080 px square",
    briefHref: "./briefs/graphic-design-orchestra.docx",
    assetHref: "./briefs/orchestra-photo-pack.zip",
    accent: "orange",
    deliverables: ["Print flyer at 300 DPI", "1080 × 1080 social post", "At least two supplied photos in each format", "Full accessibility statement on the flyer"],
    workflow: ["Review BSU guidelines", "Sketch both aspect ratios", "Choose at least two photographs", "Build a clear hierarchy", "Check legibility over photography", "Send a midpoint client check-in"],
    constraints: ["Use approved BSU colors and typefaces", "Preserve the subject matter of photos", "Keep print accessibility copy at 7 pt or larger", "Make every event detail legible at small size"],
    assets: ["_MG_5086-14.jpg", "_MG_5106-33.jpg", "_MG_5110-37.jpg", "_MG_5111-38.jpg", "_MG_5112-39.jpg", "_MG_5113-40.jpg", "_MG_5145-72.jpg", "_MG_5146-73.jpg", "_MG_5149-76.jpg"],
  },
  {
    id: "internship-spotlight",
    title: "Student Internship Spotlight",
    discipline: "Social Media",
    kicker: "Interview, design, publish",
    summary: "Interview a Sustainability & Life Sciences student, shape a clear story, and publish a warm, student-forward recognition post.",
    timeline: "1 week",
    format: "1080 × 1080 px + caption",
    briefHref: "./briefs/social-media-internship.docx",
    accent: "mint",
    deliverables: ["Instagram/Facebook graphic", "Two-to-four sentence caption", "Strong student photograph", "Approved pull quote and relevant hashtags"],
    workflow: ["Confirm missing company details", "Schedule a short interview", "Request a high-quality photo", "Choose one specific quote", "Design with restraint", "Get subject and client approval before publishing"],
    constraints: ["Keep the student and story central", "Use a warm, celebratory tone", "Avoid busy graphics", "Get explicit permission for every photo and quote"],
  },
  {
    id: "sizzle-reel",
    title: "Digital Corps Sizzle Reel",
    discipline: "Video Editing",
    kicker: "Under 60 seconds · vertical",
    summary: "Film and edit an authentic mini-documentary about a Digital Corps designer and the process behind a Dance Follies flyer.",
    timeline: "1 week",
    format: "1080 × 1920 px · H.264 MP4",
    briefHref: "./briefs/video-editing-sizzle-reel.docx",
    accent: "silver",
    deliverables: ["Vertical 9:16 sizzle reel", "Final cut under 60 seconds", "Branded intro/outro and lower thirds", "Captions strongly recommended"],
    workflow: ["Review the featured project", "Schedule a 30-minute vertical shoot", "Capture interview plus varied B-roll", "Lead with a strong hook", "Intercut process and final work", "Review on a phone before export"],
    constraints: ["Design and shoot vertically from the start", "Use current Digital Corps video templates", "Prioritize personality over corporate polish", "Get subject sign-off before delivery", "Save project files and raw footage to the shared team folder"],
  },
];

export const statusLabels: Record<SkillStatus, string> = {
  "not-started": "Not started",
  learning: "Learning",
  ready: "Ready for review",
  complete: "Complete",
};

export const statusOrder: SkillStatus[] = ["not-started", "learning", "ready", "complete"];
