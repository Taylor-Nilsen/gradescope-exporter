# Chrome Web Store listing

Name and short description come from manifest.json.

## Detailed description

Class Exporter saves your Gradescope submissions and your Canvas courses to a ZIP on your computer, so you keep them after the term ends or you lose access.

Gradescope
• Pick whole courses or single assignments
• Get the original you turned in, the graded copy with annotations, or both
• Files are named by course, prof, term, and assignment, like mae_102_rivera_f26_hw_1.pdf
• Click any course or prof name to fix it, and it's remembered

Canvas
• Works with any school's Canvas. Enter your Canvas address once and allow access
• Exports the syllabus, modules, assignments, quizzes, pages, discussions, announcements, and files
• Each item is saved as HTML with its linked files next to it, your submitted files under submission/, and outside links in links.txt
• Quizzes include every attempt: the questions, your uploaded answers, and your score
• Course files keep their Canvas folder structure

Private
• Runs in your browser using your own login
• No account, no tracking, no servers. Nothing is sent anywhere except Gradescope and your school's Canvas

How to use
1. Click the extension icon
2. Pick the Gradescope or Canvas tab and tick what you want
3. Click Export to ZIP

Not affiliated with Gradescope, Turnitin, Canvas, or Instructure.

## Images
- screenshot-1-gradescope.png, screenshot-2-canvas.png, screenshot-3-export.png, screenshot-4-dark.png (1280x800)
- promo-small-440x280.png (small promo tile)
- promo-marquee-1400x560.png (marquee promo tile)
- Regenerate: `node store/mock.js <gs|cv|done> <light|dark> <out.png>` for raw UI shots, then `node store/compose.js`
