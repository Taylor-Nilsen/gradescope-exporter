# Gradescope Exporter

Brave/Chrome extension that zips up your Gradescope submissions. Export one assignment or a whole course, originals and/or graded copies.

## Install
1. `brave://extensions` (or `chrome://extensions`) → enable **Developer mode**
2. **Load unpacked** → pick this folder

## Use
1. Open any Gradescope page (a course or submission page gets pre-selected)
3. Tick courses (or **Select all**), or expand one to pick individual assignments; choose original and/or graded copy. Click a term to fix it if Gradescope has it wrong (remembered; clear it to reset)
3. Tick courses, or expand one to pick individual assignments; choose original and/or graded copy
4. **Export to ZIP** → one folder per course named like `mae_174_mosleh_f16` (course, prof, term), files named like `mae_174_mosleh_f16_mt` (plus assignment) and `mae_174_mosleh_f16_mt_graded`

Graded copies only exist for graded assignments; ungraded ones are skipped with a note in the log.
