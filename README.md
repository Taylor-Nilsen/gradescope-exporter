# Gradescope Exporter

Brave/Chrome extension that zips up your Gradescope submissions (originals and/or graded copies) and everything in your Canvas courses.

## Install
1. `brave://extensions` (or `chrome://extensions`) → enable **Developer mode**
2. **Load unpacked** → pick this folder

## Use
1. Open any Gradescope page (a course or submission page gets pre-selected)
3. Tick courses (or **Select all**), or expand one to pick individual assignments; choose original and/or graded copy. Click a course name, prof, term, or assignment name to change it (remembered; clear it to reset to Gradescope's)
4. **Export to ZIP** → `gradescope_export_<your name>_2026-11-05_16-42-07.zip`, with one folder per course inside named like `mae_174_mosleh_f16` (course, prof, term), files named like `mae_174_mosleh_f16_mt` (plus assignment) and `mae_174_mosleh_f16_mt_graded`

Graded copies only exist for graded assignments; ungraded ones are skipped with a note in the log.

## Canvas
1. Open the extension from a Canvas page, or switch to the **Canvas** tab and enter your school's Canvas address (like `canvas.ucsd.edu`), then **Connect**. The browser asks for access to that site once; it's remembered after that
2. Tick courses, or expand one to pick items. Items are grouped by category (Syllabus, Modules, Assignments, Quizzes, Pages, Discussions, Announcements, Files) and each category has its own select all
3. **Export to ZIP** → `canvas_export_<your name>_<date>_<time>.zip`, one folder per course, one folder per category inside it

How items are saved:
- An item with nothing attached is a single `.html` file (`assignments/mae_174_mosleh_f16_hw_1.html`)
- An item with linked or embedded Canvas files, attachments, or your submission gets its own folder named after the item, with the `.html`, every linked file, your submitted files under `submission/`, and any outside links in `links.txt`
- Quizzes include every attempt: the questions, any files embedded in them, your uploaded answers, and your score
- Modules are a folder each, items numbered in module order; link and external tool items are `.txt` files holding the URL
- Course files keep their Canvas folder structure under `files/`
- Anything that fails to download (locked, no access) is logged and its URL goes in `links.txt` instead
