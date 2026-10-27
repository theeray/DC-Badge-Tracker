# Tutorial catalog cleanup — 2026-10-27

This update changes catalog content and adds two supplied PDFs. It does not
change Authentication, Firestore rules, user records, saved progress,
endorsements, assignments, or any knowledge-check bank/guide/attempt version.
The catalog now has 90 entries; the 30 existing knowledge checks still cover
the same 44 tutorial IDs. The original 92-entry audit remains a dated snapshot.

## Corrected and added

- The old `on-ai-spell` video is now accurately titled **Typography Basics &
  Figma: Leading, Line Height, Widows & Orphans** and appears in Content →
  Graphic Design. The existing ID follows the existing video so saved records
  are not silently reassigned to a different lesson.
- New `on-illustrator-spellcheck` links to Adobe's actual Illustrator spelling
  lesson in Onboarding → Finished Project Checklist.
- The supplied **Digital Corps Pre-Meeting Project Checklist** and **Digital
  Corps Post-Meeting Project Checklist** appear in Onboarding → Client Relations
  and Leadership. They use fresh IDs and start incomplete rather than inheriting
  completion from the old blank intake form. The uploaded PDF bytes are unchanged.
- Logo Reveal retains its assignment PDF and now separately labels Adobe's
  written After Effects alpha-matte reveal process and logo-animation lesson.
  The technical examples do not substitute for every assignment criterion.
- Grammar Check uses the Microsoft Editor/Word for the web lesson. Express is
  narrowed to **Adobe Express: Animate a Design**.
- Ronin has an official DJI RS 4/RS 4 Pro setup guide, clearly requiring
  confirmation of the actual DC model. Vox Pop has a manufacturer-authored
  process guide and a separate link to the existing DC microphone orientation;
  it does not claim that the manufacturer/model matches DC hardware.
- B-Roll has Adobe coverage and shot-list guides. Audio syncing uses Adobe's
  actual timeline synchronization instructions. Make an iorad Tutorial uses
  the supplied `2275907` lesson.
- Both existing Premiere packaging IDs now explicitly share Adobe's Project
  Manager handoff lesson. The Motion Graphics entry is labeled as a shared
  reference, not a second distinct technique. Keeping both IDs preserves saved
  progress and assignments. The original packaging video remains supplemental.
- Animate Characters is accurately labeled **with Adobe Express**. It is not
  Adobe Character Animator.

## Retired from the visible catalog

- `sm-brief`: the erroneous Social Media Creative Brief/QR-code link. The real
  InDesign QR lesson and correctly linked shared Creative Briefs remain.
- `on-checklist`, `lead-checklist`: the blank job-intake sheet, replaced by the
  new pre/post-meeting entries. The old static asset is retained for old links.
- `sm-linktree`, `sm-linktree-guide`, `sm-login`, `cc-character-animator`.

Retirement is not database deletion. The tracker merges saved status keys with
current defaults, so legacy records are preserved when members update progress.
The existing Custom QR Code check can still refer to a QR-code export in its
original source; retiring the separate Linktree training entries does not
rewrite that immutable check. No new knowledge checks are claimed for these
replacement lessons in this release.

## Verified sources

- Illustrator: https://helpx.adobe.com/illustrator/desktop/design-with-text/edit-format-text/check-and-correct-spelling.html
- Grammar: https://support.microsoft.com/en-us/word/check-grammar-spelling-and-more-in-word-for-the-web
- After Effects reveal: https://www.adobe.com/learn/after-effects/web/animate-title-reveal
- Logo animation: https://www.adobe.com/learn/premiere-pro/web/logo-animation
- Express: https://helpx.adobe.com/express/web/audio-and-animation/animate-design.html
- DJI: https://repair.dji.com/help/content?customId=01700010078&documentType=&lang=en&paperDocType=ARTICLE&re=US&spaceId=17
- B-roll: https://www.adobe.com/creativecloud/video/discover/b-roll.html
- Shot list: https://www.adobe.com/creativecloud/video/discover/shot-list.html
- Audio sync: https://helpx.adobe.com/premiere/desktop/add-audio-effects/basic-audio-editing/synchronize-clips-in-the-timeline-panel.html
- Vox Pop: https://www.hollyland.com/blog/topics/how-to-do-a-vox-pop
- Project Manager: https://helpx.adobe.com/premiere/desktop/organize-media/create-projects/copy-project.html
- iorad: https://www.iorad.com/player/2275907/Make-an-iorad-Tutorial

The PDFs retain their supplied wording, including recording and social-media
handoff references. The app's contextual notes ask members to confirm current
director-approved tools, consent practices, and responsibilities.
