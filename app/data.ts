export type SkillStatus = "not-started" | "learning" | "ready" | "complete";

export type SkillResourceLink = {
  label: string;
  href: string;
};

export type Skill = {
  id: string;
  title: string;
  group: string;
  area: string;
  href?: string;
  resourceLabel?: string;
  resourceNote?: string;
  additionalResources?: SkillResourceLink[];
  internal?: boolean;
  searchTerms?: string[];
  tier?: "Silver" | "Gold";
};

export function getSkillResources(item: Skill): SkillResourceLink[] {
  return [
    ...(item.href
      ? [{
          href: item.href,
          label: item.resourceLabel ?? (item.internal ? "Open Teams resource" : "Open tutorial"),
        }]
      : []),
    ...(item.additionalResources ?? []),
  ];
}

export type LearningArea = {
  id: string;
  name: string;
  shortName: string;
  eyebrow: string;
  description: string;
  skills: Skill[];
};

export const INTERNAL_TEAMS_RESOURCE_URL =
  "https://teams.microsoft.com/l/team/19%3AUIhQN2iqNSIljAAW6JJ4gZdbWgH-Pnxr4cr8upXezsk1%40thread.tacv2/conversations?groupId=e4fbc62c-f4bd-487d-85c5-ec9f5f24bce0&tenantId=5011c7c6-0ab4-46ab-9ef4-fae74a921a7f";

const skill = (
  area: string,
  group: string,
  id: string,
  title: string,
  extra: Omit<Skill, "area" | "group" | "id" | "title"> = {},
): Skill => ({
  area,
  group,
  id,
  title,
  ...extra,
  ...(extra.internal && !extra.href ? { href: INTERNAL_TEAMS_RESOURCE_URL } : {}),
});

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
    description: "Core tools, client-ready habits, meeting preparation, and project quality checks.",
    skills: [
      skill(ONBOARDING, "Training & Skill Building", "on-work-study-eligibility", "Check Work-Study Eligibility", { href: "https://www.iorad.com/player/2450841/Check-to-see-if-you-are-eligible-for-Work-Study---Payroll-at-Bemidji-State-University" }),
      skill(ONBOARDING, "Training & Skill Building", "on-payroll", "Work Study & Payroll Paperwork", { href: "https://www.iorad.com/player/2432928/Fill-Out-Work-Study---Payroll-Paperwork-for-Digital-Corps", searchTerms: ["fill out paperwork", "filling out the paperwork", "regular payroll"] }),
      skill(ONBOARDING, "Training & Skill Building", "on-files", "File Organization Guide", { href: "/resources/onboarding/file-organization-guide.pdf" }),
      skill(ONBOARDING, "Training & Skill Building", "on-planner", "Use MS Teams Planner", { href: "https://youtu.be/r3dpzqttDuA" }),
      skill(ONBOARDING, "Training & Skill Building", "on-hours", "Enter Submitted Payroll Hours", { href: "/resources/onboarding/enter-work-hours-steps.docx", searchTerms: ["e-services", "student employment", "timesheet"] }),
      skill(ONBOARDING, "Client Relations", "on-primary", "How to Make Primary Contact", { href: "https://www.iorad.com/player/2433316/Social-Media-Campaign-1--How-to-Make-First-Contact" }),
      skill(ONBOARDING, "Client Relations", "on-meeting", "Client Meeting Checklist", { href: "/resources/onboarding/client-meeting-checklist.docx" }),
      skill(ONBOARDING, "Client Relations", "on-brand", "Use Digital Corps Brand Guide", { internal: true }),
      skill(ONBOARDING, "Client Relations", "on-briefs", "Creative Briefs", { href: "https://www.iorad.com/player/2447654/Editing-a-Digital-Corps-Creative-Brief" }),
      skill(ONBOARDING, "Client Relations", "on-bsu-brand", "BSU Branding Guide", { internal: true }),
      skill(ONBOARDING, "Client Relations", "on-tad-brand", "TAD Branding Guide", { internal: true }),
      skill(ONBOARDING, "Client Relations", "on-presentation", "Make a Digital Presentation with InDesign", { href: "https://www.iorad.com/player/2607783/Make-a-Digital-Presentation-with-InDesign" }),
      skill(ONBOARDING, "Client Relations", "on-costing", "Fill out TAD Costing Estimator", { href: "https://www.iorad.com/player/2477485/Fill-out-the-TAD-Costing-FORM" }),
      skill(ONBOARDING, "Client Relations", "on-make-brief", "Make a Creative Brief", { href: "https://www.iorad.com/player/2447654/Editing-a-Digital-Corps-Creative-Brief" }),
      skill(ONBOARDING, "Client Relations", "on-pre-meeting-checklist", "Digital Corps Pre-Meeting Project Checklist", {
        href: "/resources/onboarding/digital-corps-pre-meeting-project-checklist.pdf",
        resourceLabel: "Open pre-meeting checklist (PDF)",
        resourceNote: "The supplied DC checklist covers meeting preparation, professional conduct, notes, and documentation. Use only director-approved recording tools and obtain permission before recording.",
        searchTerms: ["before meeting", "client meeting", "pre meeting", "uniform", "notes", "Planner"],
      }),
      skill(ONBOARDING, "Client Relations", "on-post-meeting-checklist", "Digital Corps Post-Meeting Project Checklist", {
        href: "/resources/onboarding/digital-corps-post-meeting-project-checklist.pdf",
        resourceLabel: "Open post-meeting checklist (PDF)",
        resourceNote: "The supplied DC checklist covers follow-up, Planner updates, file handoff, and client confirmation before closing a job. Confirm current social-media handoff responsibilities with a director.",
        searchTerms: ["after meeting", "follow up", "post meeting", "closing job", "finished files", "Planner"],
      }),
      skill(ONBOARDING, "Finished Project Checklist", "on-grammar", "Grammar Check: Microsoft Editor", {
        href: "https://support.microsoft.com/en-us/word/check-grammar-spelling-and-more-in-word-for-the-web",
        resourceLabel: "Microsoft: Review grammar in Word for the web",
        resourceNote: "Use Editor to review suggestions and explanations, then decide what to accept or ignore. Available refinements depend on your Microsoft 365 access; manually proofread names, facts, and final design text too.",
        searchTerms: ["grammar", "proofreading", "Microsoft Editor", "Word", "client email"],
      }),
      skill(ONBOARDING, "Finished Project Checklist", "on-illustrator-spellcheck", "Spellcheck: Illustrator", {
        href: "https://helpx.adobe.com/illustrator/desktop/design-with-text/edit-format-text/check-and-correct-spelling.html",
        resourceLabel: "Adobe: Check and correct Illustrator spelling",
        resourceNote: "The actual Illustrator spelling workflow: manual and automatic checks, correcting or ignoring a word, and adding a verified word to the dictionary.",
        searchTerms: ["Illustrator", "spellcheck", "spelling", "proofreading"],
      }),
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
      skill(CONTENT, "Graphic Design", "cc-export-pdf", "Export InDesign to PDF", { href: "https://www.iorad.com/player/2262007/Export-InDesign-Documents-as-PDF-Spreads--TAD-ZINES-", tier: "Silver" }),
      skill(CONTENT, "Graphic Design", "cc-package-id", "Package InDesign Files", { href: "/resources/onboarding/indesign-package-guide.pdf", tier: "Gold" }),
      skill(CONTENT, "Graphic Design", "cc-poster-design", "Poster Design", { href: "https://www.iorad.com/player/2467747/Make-an-Anatomy-of-Type-Poster", tier: "Silver" }),
      skill(CONTENT, "Graphic Design", "cc-mockups", "Mockup Templates", { href: "https://www.iorad.com/player/2428157/Use-a-Mockup-Template", tier: "Silver" }),
      skill(CONTENT, "Graphic Design", "cc-make-poster", "Make a Poster", { href: "https://www.iorad.com/player/2467747/Make-an-Anatomy-of-Type-Poster", tier: "Gold" }),
      skill(CONTENT, "Graphic Design", "cc-stickers", "Stickers", { href: "https://sites.google.com/view/tad-tutorials/hp-330-335-printers?authuser=1", tier: "Silver" }),
      skill(CONTENT, "Graphic Design", "cc-mistakes", "20 Common Mistakes Quiz", { href: "https://forms.cloud.microsoft/r/6LtVKuxu0n", tier: "Silver" }),
      skill(CONTENT, "Graphic Design", "cc-scan", "Scan Artwork", { href: "https://www.iorad.com/player/2546410/Scan-Artwork-in-TAD", tier: "Silver" }),
      skill(CONTENT, "Graphic Design", "on-ai-spell", "Typography Basics & Figma: Leading, Line Height, Widows & Orphans", {
        href: "https://www.youtube.com/watch?v=ns6orFTwDwE",
        resourceLabel: "Watch typography and Figma lesson",
        resourceNote: "Previously mislabeled as Illustrator spellcheck. This video teaches typography and Figma; the separate Spellcheck: Illustrator entry now links to Adobe's actual spelling instructions.",
        searchTerms: ["typography", "Figma", "leading", "line height", "widows", "orphans"],
      }),

      skill(CONTENT, "Photography", "cc-headshots", "Headshots", {
        href: "https://alphauniverse.com/stories/gear--settings-and-more-go-behind-the-scenes-of-a-pro-studio-portrait-shoot/",
        resourceLabel: "Portrait lighting & 24–105mm tutorial",
        resourceNote: "Uses the Sony 24–105mm f/4 G lens on a different Sony body. For our a7 IV controls, also open Use the Digital Corps Camera. Confirm the studio light and trigger with a mentor before shooting.",
        searchTerms: ["head shots", "portraits", "studio lighting", "Sony a7 IV", "24-105", "70-200"],
      }),
      skill(CONTENT, "Photography", "cc-lighting", "Lighting Studio", { href: "https://www.iorad.com/player/2455074/Light-an-Object-and-or-Product-with-the-Lighting-Studio-Light-Box-" }),
      skill(CONTENT, "Photography", "cc-camera", "Use the Digital Corps Camera", {
        href: "https://support.d-imaging.sony.co.jp/support/ilc/autofocus/ilce7m4/en/03.php",
        resourceLabel: "Sony a7 IV: Face & Eye AF setup",
        resourceNote: "Sony’s step-by-step guide for focusing on a person’s eyes with our a7 IV (ILCE-7M4). Use this alongside the Headshots lighting tutorial.",
        searchTerms: ["headshots", "head shots", "portrait", "Sony a7 IV", "a7iv", "ILCE-7M4", "autofocus", "eye AF"],
      }),
      skill(CONTENT, "Photography", "cc-lapel", "Wireless Lapel Microphone", { href: "https://www.iorad.com/player/2620488/Use-the-Wireless-Lapel-Mic-with-the-Digital-Corps-Camera" }),
      skill(CONTENT, "Photography", "cc-camera-overview", "Camera Interview Overview", { href: "https://www.iorad.com/player/2365987/Use-the-Digital-Corps-Camera-to-Conduct-an-Interview" }),
      skill(CONTENT, "Photography", "cc-gimbal", "Ronin Gimbal: Setup & Operation", {
        href: "https://repair.dji.com/help/content?customId=01700010078&documentType=&lang=en&paperDocType=ARTICLE&re=US&spaceId=17",
        resourceLabel: "DJI: RS 4 / RS 4 Pro beginner guide",
        resourceNote: "Model-specific example covering charging, activation, mounting, balancing, and controls. Confirm the label on the DC gimbal and follow the matching model's instructions with a mentor before operating it.",
        searchTerms: ["Ronin", "DJI", "gimbal", "RS 4", "RS4", "setup", "balancing"],
      }),
      skill(CONTENT, "Photography", "cc-gimbal-balance", "Attach & Balance Camera", { href: "https://youtu.be/iPKBbyKkQFw?si=ftcYwypY6v8i2NiX" }),
      skill(CONTENT, "Photography", "cc-gimbal-pair", "Pair Camera to Gimbal", {
        href: "https://cdn.djivideos.com/watch/559f8b1f-5845-4e3e-96bc-8a792a7c6e93",
        resourceLabel: "DJI: How to Connect a Camera",
        resourceNote: "Official RS 4 / RS 4 Pro connection video. Check the label on our gimbal and use DJI’s compatibility guide for its exact model and camera. Cable and Bluetooth support vary.",
        additionalResources: [{ label: "Check gimbal & camera compatibility", href: "https://www.dji.com/support/compatibility" }],
        searchTerms: ["DJI", "Ronin", "pairing", "Bluetooth", "camera control cable", "RS 4", "RS4"],
      }),
      skill(CONTENT, "Photography", "cc-gimbal-overview", "Gimbal Overview", { href: "https://youtu.be/zcf3VokG7_Q?si=EhemzOMlNSM_ONJX" }),
      skill(CONTENT, "Photography", "cc-upscale", "Upscale Images (Super Resolution)", { href: "https://youtu.be/izJHaC6sKPY" }),

      skill(CONTENT, "Audio / Video", "cc-broll", "B-Roll: Shot List & Tips", {
        href: "https://www.adobe.com/creativecloud/video/discover/b-roll.html",
        resourceLabel: "Adobe: Plan and shoot B-roll",
        additionalResources: [{ label: "Adobe: Build a shot list", href: "https://www.adobe.com/creativecloud/video/discover/shot-list.html" }],
        resourceNote: "Plan supporting footage and varied coverage before filming, then use a shot list to track the shots, framing, movement, and audio the edit needs.",
        searchTerms: ["B roll", "broll", "shot list", "coverage", "supporting footage"],
      }),
      skill(CONTENT, "Audio / Video", "cc-ken-burns", "Ken Burns Effect", { href: "https://youtu.be/Wfid8jnFdyg" }),
      skill(CONTENT, "Audio / Video", "cc-pip", "Picture in Picture", { href: "https://youtu.be/eNKzKz0tTCU" }),
      skill(CONTENT, "Audio / Video", "cc-audio", "Improve Audio", { href: "https://www.iorad.com/player/2365898/Improve-Audio-on-any-Video-with-Audacity-Plugin--Compress-Dynamics" }),
      skill(CONTENT, "Audio / Video", "cc-package-pr", "Package Premiere Pro", {
        href: "https://helpx.adobe.com/premiere/desktop/organize-media/create-projects/copy-project.html",
        resourceLabel: "Adobe: Collect a Premiere project with Project Manager",
        additionalResources: [{ label: "Original packaging video", href: "https://youtu.be/TnbMdqEtsSc?si=kAC5lo5s3iMvKCkS" }],
        resourceNote: "Collect and copy the selected sequences and supporting media into a new handoff folder. The Motion Graphics packaging entry shares this same Project Manager lesson.",
        searchTerms: ["Project Manager", "collect", "copy", "package", "Premiere", "handoff"],
      }),
      skill(CONTENT, "Audio / Video", "cc-sync", "Sync Audio in Premiere Pro", {
        href: "https://helpx.adobe.com/premiere/desktop/add-audio-effects/basic-audio-editing/synchronize-clips-in-the-timeline-panel.html",
        resourceLabel: "Adobe: Synchronize clips in the timeline",
        resourceNote: "Select the camera and separately recorded audio clips, choose a synchronization method, and check the resulting alignment before editing.",
        searchTerms: ["synchronize", "sync audio", "waveform", "external recorder", "Premiere"],
      }),
      skill(CONTENT, "Audio / Video", "cc-vox-resources", "Vox Pop Interview Resources", { internal: true }),
      skill(CONTENT, "Audio / Video", "cc-vox-tutorial", "Vox Pop: Interviews & Microphone Technique", {
        href: "https://www.hollyland.com/blog/topics/how-to-do-a-vox-pop",
        resourceLabel: "Vox Pop: Plan, record, and edit interviews",
        additionalResources: [{ label: "DC wireless lapel microphone orientation", href: "https://www.iorad.com/player/2620488/Use-the-Wireless-Lapel-Mic-with-the-Digital-Corps-Camera" }],
        resourceNote: "General interview technique, not confirmation of our DC microphone model. Use the DC mic orientation with a mentor, check and monitor audio before recording, and follow director-approved consent and release procedures.",
        searchTerms: ["vox pop", "voxpop", "street interview", "DC mics", "microphone", "lapel"],
      }),

      skill(CONTENT, "Studio Production", "cc-studio-camera", "IM Studio: Camera Setup", { internal: true }),
      skill(CONTENT, "Studio Production", "cc-studio-audio", "IM Studio: Audio Booth", { internal: true }),
      skill(CONTENT, "Studio Production", "cc-studio-interview", "IM Studio: Conduct Interview", { internal: true }),

      skill(CONTENT, "Motion Graphics", "cc-logo-reveal", "Logo Reveal", {
        href: "/resources/onboarding/logo-reveal-tutorial.pdf",
        resourceLabel: "Open logo-reveal assignment brief (PDF)",
        additionalResources: [
          { label: "Technical process: After Effects alpha-matte reveal", href: "https://www.adobe.com/learn/after-effects/web/animate-title-reveal" },
          { label: "Adobe: Animate a logo for video", href: "https://www.adobe.com/learn/premiere-pro/web/logo-animation" },
        ],
        resourceNote: "The PDF lists assignment requirements. Adobe's title-reveal lesson supplies a step-by-step matte/keyframe technique adaptable to logo artwork; the logo-video lesson adds a broader animation and delivery workflow. These techniques do not replace the brief's full requirements, and some video interfaces are older.",
        searchTerms: ["logo reveal", "After Effects", "track matte", "alpha matte", "keyframes", "logo animation"],
      }),
      skill(CONTENT, "Motion Graphics", "cc-ae-handwriting-matte", "After Effects: Handwriting Animation with Matte Masking", {
        href: "https://www.youtube.com/watch?v=o0-nyp4Q3hw",
        resourceNote: "Handwriting animation with a moving pen effect. Use matte masking to reveal the lettering as it is written.",
        searchTerms: ["After Effects", "hand writing", "handwriting", "matte", "masking", "moving pen", "write on", "text animation"],
      }),
      skill(CONTENT, "Motion Graphics", "cc-motion-package-pr", "Package Premiere Pro (Shared Handoff Lesson)", {
        href: "https://helpx.adobe.com/premiere/desktop/organize-media/create-projects/copy-project.html",
        resourceLabel: "Adobe: Collect a Premiere project with Project Manager",
        resourceNote: "Shared lesson: the same Project Manager handoff process as Package Premiere Pro in Audio / Video, not an additional distinct technique. This existing entry is retained so its saved progress and assignments remain available.",
        searchTerms: ["Project Manager", "Premiere", "package", "collect", "copy", "handoff"],
      }),
      skill(CONTENT, "Motion Graphics", "cc-package-ae", "Package After Effects", { href: "https://youtu.be/bUoyPm3DWpM?si=EW6tssaL5-fooL88" }),
      skill(CONTENT, "Motion Graphics", "cc-text-reveal", "Text Reveal Effect", { href: "https://youtu.be/78uhkYo5UOE?si=irtMIjNFmvRAHAeu" }),
      skill(CONTENT, "Motion Graphics", "cc-animate-logo", "Animate Parts of a Logo", { href: "https://youtu.be/UFTnR19zB7k?si=Q6g4Mj1QRFF1htFo" }),
      skill(CONTENT, "Motion Graphics", "cc-ae-export", "Export a Video from After Effects", { href: "https://youtu.be/ClGaK8fIJVk?si=-kPbh2YwkuVQfjGw" }),
      skill(CONTENT, "Motion Graphics", "cc-express", "Adobe Express: Animate a Design", {
        href: "https://helpx.adobe.com/express/web/audio-and-animation/animate-design.html",
        resourceLabel: "Adobe Express: Animate designs",
        resourceNote: "A focused lesson on applying and adjusting entrance, exit, and looping animation to design elements, then downloading the animated result.",
        searchTerms: ["Adobe Express", "animate", "animation", "in", "out", "loop"],
      }),
      skill(CONTENT, "Motion Graphics", "cc-simple-motion", "Simple Motion Graphics", { href: "https://youtu.be/Pa0rseRupGM?si=L3dOAlr-ytWFGQ6E" }),
      skill(CONTENT, "Motion Graphics", "cc-characters", "Animate Characters with Adobe Express", { href: "https://youtu.be/PxWG2CBN5oQ", resourceNote: "Adobe Express Animate from Audio lesson; this is not Adobe Character Animator.", searchTerms: ["Adobe Express", "Animate from Audio", "character animation"] }),
      skill(CONTENT, "Motion Graphics", "cc-video-mockup", "Make a Video Mockup", { href: "https://www.iorad.com/player/2645750/Make-a-Video-Mockup" }),

      skill(CONTENT, "Exhibit Design", "cc-bematrix-format", "BeMatrix Panel: Formatting", { internal: true }),
      skill(CONTENT, "Exhibit Design", "cc-bematrix-print", "BeMatrix Panel: Printing", { internal: true }),
      skill(CONTENT, "Exhibit Design", "cc-hp-printers", "Stickers / HP 330-335 Printers", { internal: true }),
      skill(CONTENT, "Fabrication", "cc-dye-sub", "Print for Dye Sublimation", { internal: true }),
      skill(CONTENT, "Fabrication", "cc-heat-press", "Heat Press a Shirt", { href: "https://www.iorad.com/player/1937653/Heat-pressing-a-T-shirt--or-other-flat-substrate-" }),
      skill(CONTENT, "Fabrication", "cc-embroidery-machine", "Embroidery Machine Tutorial", { href: "https://www.iorad.com/player/2710821/Embroidery-Machine-Tutorial#trysteps-1", searchTerms: ["embroidery", "embroider", "sewing", "machine"] }),
    ],
  },
  {
    id: SOCIAL,
    name: "Social Media & Marketing",
    shortName: "Social",
    eyebrow: "Plan & connect",
    description: "Campaign planning, publishing, analytics, and confident client communication.",
    skills: [
      skill(SOCIAL, "Marketing", "sm-qr", "Custom QR Codes", { href: "https://www.iorad.com/player/1953084/Make-a-Custom-QR-Code" }),
      skill(SOCIAL, "Marketing", "sm-id-qr", "InDesign QR Code", { href: "https://youtu.be/jerBF6CKaY8?si=LYnHhftTJLG-tKw0" }),

      skill(SOCIAL, "Social Media Content", "sm-plan", "Social Media Plan", { href: "https://www.youtube.com/watch?v=VS0Sao1oHlw" }),
      skill(SOCIAL, "Social Media Content", "sm-calendar", "Content Calendar", { href: "https://www.youtube.com/watch?v=43pg1XX9YnU" }),
      skill(SOCIAL, "Social Media Content", "sm-schedule", "Scheduling Posts in Meta Business Suite", { href: "https://www.youtube.com/watch?v=_60YKMMeKv0" }),
      skill(SOCIAL, "Social Media Content", "sm-insights", "Insights Analysis in Meta Business Suite", { href: "https://www.youtube.com/watch?v=sDCCCrhtguI" }),
      skill(SOCIAL, "Social Media Content", "sm-pillars", "Content Pillars", { href: "https://www.youtube.com/watch?v=5wDGFEDx414" }),

      skill(SOCIAL, "Client Relations", "sm-primary", "How to Make Primary Contact", { href: "https://www.iorad.com/player/2433316/Social-Media-Campaign-1--How-to-Make-First-Contact" }),
      skill(SOCIAL, "Client Relations", "sm-meeting", "Client Meeting Checklist", { href: "/resources/onboarding/client-meeting-checklist.docx" }),
      skill(SOCIAL, "Client Relations", "sm-dc-brand", "Use Digital Corps Brand Guide", { internal: true }),
      skill(SOCIAL, "Client Relations", "sm-briefs", "Creative Briefs", { href: "https://www.iorad.com/player/2447654/Editing-a-Digital-Corps-Creative-Brief" }),
      skill(SOCIAL, "Client Relations", "sm-bsu", "BSU Branding Guide", { internal: true }),
      skill(SOCIAL, "Client Relations", "sm-tad", "TAD Branding Guide", { internal: true }),
      skill(SOCIAL, "Client Relations", "sm-presentation", "Make a Digital Presentation with InDesign", { href: "https://www.iorad.com/player/2607783/Make-a-Digital-Presentation-with-InDesign" }),
      skill(SOCIAL, "Client Relations", "sm-costing", "Fill out TAD Costing Estimator", { href: "https://www.iorad.com/player/2477485/Fill-out-the-TAD-Costing-FORM" }),
      skill(SOCIAL, "Client Relations", "sm-make-brief", "Make a Creative Brief", { href: "https://www.iorad.com/player/2447654/Editing-a-Digital-Corps-Creative-Brief" }),
    ],
  },
  {
    id: LEADERSHIP,
    name: "Leadership",
    shortName: "Leadership",
    eyebrow: "Guide the team",
    description: "Project ownership, meetings, mentoring, and teaching others through clear tutorials.",
    skills: [
      skill(LEADERSHIP, "Training & Skill Building", "lead-planner", "Use MS Teams Planner", { href: "https://youtu.be/r3dpzqttDuA" }),
      skill(LEADERSHIP, "Training & Skill Building", "lead-pre-meeting-checklist", "Digital Corps Pre-Meeting Project Checklist", {
        href: "/resources/onboarding/digital-corps-pre-meeting-project-checklist.pdf",
        resourceLabel: "Open pre-meeting checklist (PDF)",
        resourceNote: "The same supplied pre-meeting checklist used in Onboarding. Use current director-approved recording tools and obtain permission before recording.",
        searchTerms: ["pre meeting", "before meeting", "client", "uniform", "Planner"],
      }),
      skill(LEADERSHIP, "Training & Skill Building", "lead-post-meeting-checklist", "Digital Corps Post-Meeting Project Checklist", {
        href: "/resources/onboarding/digital-corps-post-meeting-project-checklist.pdf",
        resourceLabel: "Open post-meeting checklist (PDF)",
        resourceNote: "The same supplied follow-up and job-closing checklist used in Onboarding. Confirm current social-media handoff responsibilities with a director.",
        searchTerms: ["post meeting", "after meeting", "follow up", "closing job", "Planner"],
      }),
      skill(LEADERSHIP, "Training & Skill Building", "lead-primary", "How to Make Primary Contact", { href: "https://www.iorad.com/player/2433316/Social-Media-Campaign-1--How-to-Make-First-Contact" }),
      skill(LEADERSHIP, "Training & Skill Building", "lead-meeting", "Client Meeting Checklist", { href: "/resources/onboarding/client-meeting-checklist.docx" }),
      skill(LEADERSHIP, "Training & Skill Building", "lead-iorad", "Make an iorad Tutorial", {
        href: "https://www.iorad.com/player/2275907/Make-an-iorad-Tutorial",
        resourceLabel: "Open Make an iorad Tutorial",
        searchTerms: ["iorad", "screen capture", "tutorial", "teach", "training"],
      }),
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
    briefHref: "/briefs/welcome-to-digital-corps.docx",
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
    briefHref: "/briefs/graphic-design-orchestra.docx",
    assetHref: "/briefs/orchestra-photo-pack.zip",
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
    briefHref: "/briefs/social-media-internship.docx",
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
    briefHref: "/briefs/video-editing-sizzle-reel.docx",
    accent: "silver",
    deliverables: ["Vertical 9:16 sizzle reel", "Final cut under 60 seconds", "Branded intro/outro and lower thirds", "Captions strongly recommended"],
    workflow: ["Review the featured project", "Schedule a 30-minute vertical shoot", "Capture interview plus varied B-roll", "Lead with a strong hook", "Intercut process and final work", "Review on a phone before export"],
    constraints: ["Design and shoot vertically from the start", "Use current Digital Corps video templates", "Prioritize personality over corporate polish", "Get subject sign-off before delivery", "Save project files and raw footage to the shared team folder"],
  },
];

export const statusLabels: Record<SkillStatus, string> = {
  "not-started": "Incomplete",
  learning: "Learning",
  ready: "Ready for review",
  complete: "Complete",
};

export const statusOrder: SkillStatus[] = ["not-started", "learning", "ready", "complete"];
